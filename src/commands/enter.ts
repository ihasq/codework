import process from "node:process";

import { appendEvents, isActionableEvent, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { detectAgentFingerprint, type AgentFingerprint } from "../core/fingerprint.ts";
import { findAgentByFingerprint } from "../core/identity.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderAutoEnter } from "../core/render.ts";
import {
  addOrRejoinAgent,
  createEvent,
  createWorkspaceState,
  findAgent,
  latestEventId,
  loadState,
  saveState
} from "../core/state.ts";
import type { AgentState, CodeworkEvent, CommandContext, CommandResult, WorkspaceState } from "../core/types.ts";
import { normalizeFollow, parseBoundedSeconds, slugifyIdentifier } from "../core/validate.ts";

export type EnterCommandOptions = {
  wait?: string;
  interval?: string;
  once?: boolean;
  follow?: string;
};

type EnterSettings = {
  waitSeconds: number;
  intervalSeconds: number;
  once: boolean;
};

type EnterRegistration = {
  state: WorkspaceState;
  agent: AgentState;
  leader?: AgentState;
  mode: "new-leader" | "existing-leader" | "new-follower" | "existing-follower";
  warning?: string;
};

type EnterPollRead = {
  state: WorkspaceState;
  agent: AgentState;
  leader?: AgentState;
  actionableEvents: CodeworkEvent[];
  nonActionableEvents: CodeworkEvent[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runEnterCommand(ctx: CommandContext, options: EnterCommandOptions): Promise<CommandResult> {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const fingerprint = detectAgentFingerprint(paths.workspaceRoot ?? paths.root);
  const settings = normalizeEnterSettings(options);
  const registration = await registerAutoEnterAgent(ctx, options, fingerprint);

  if (registration.mode === "new-leader") {
    return resultFromAutoEnter(registration, [], [], settings);
  }

  const pollSettings =
    registration.agent.leadership === "leader" ? { ...settings, waitSeconds: 0, once: true } : settings;
  const poll = await boundedAutoPoll(paths.workspaceDir!, registration.agent.name, pollSettings);
  return resultFromAutoEnter(
    {
      ...registration,
      state: poll.state,
      agent: poll.agent,
      leader: poll.leader ?? registration.leader
    },
    poll.actionableEvents,
    poll.nonActionableEvents,
    pollSettings
  );
}

function normalizeEnterSettings(options: EnterCommandOptions): EnterSettings {
  return {
    waitSeconds: options.once
      ? 0
      : parseBoundedSeconds({
          cliValue: options.wait,
          envValue: process.env.CODEWORK_POLL_WAIT_SECONDS,
          optionName: "--wait",
          fallback: 30,
          min: 0,
          max: 120
        }),
    intervalSeconds: parseBoundedSeconds({
      cliValue: options.interval,
      envValue: process.env.CODEWORK_POLL_INTERVAL_SECONDS,
      optionName: "--interval",
      fallback: 2,
      min: 1,
      max: 10
    }),
    once: Boolean(options.once)
  };
}

async function registerAutoEnterAgent(
  ctx: CommandContext,
  options: EnterCommandOptions,
  fingerprint: AgentFingerprint
): Promise<EnterRegistration> {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });

  return withWorkspaceLock(paths.workspaceDir!, async () => {
    const loaded = await loadState(paths.workspaceDir!);
    const state = loaded ?? createWorkspaceState(paths, paths.workspace ?? "workspace");
    const events: CodeworkEvent[] = [];
    let warning: string | undefined;

    const existing = findAgentByFingerprint(state, fingerprint.hash);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      existing.active = true;
      state.updatedAt = existing.lastSeenAt;
      await saveState(paths.workspaceDir!, state);
      return {
        state,
        agent: existing,
        leader: resolveLeader(state).leader,
        mode: existing.leadership === "leader" ? "existing-leader" : "existing-follower"
      };
    }

    if (!loaded || Object.values(state.agents).filter((agent) => agent.active).length === 0) {
      const leaderName = autoName(ctx, "leader");
      const { agent } = addOrRejoinAgent(state, {
        name: leaderName,
        follow: normalizeFollow(options.follow ?? "user"),
        role: "leader",
        cursorEventId: 0,
        fingerprintHash: fingerprint.hash,
        fingerprintSource: fingerprint.source,
        autoNamed: !ctx.name && !process.env.CODEWORK_AGENT_NAME,
        leadership: "leader"
      });
      state.leaderAgent = agent.name;
      if (!loaded) {
        events.push(
          createEvent(state, {
          actor: agent.name,
          type: "workspace.created",
          payload: {
            workspaceKind: state.workspaceKind,
            workspaceRoot: state.workspaceRoot,
            defaultApplied: "follow=user"
          }
          })
        );
      }
      events.push(
        createEvent(state, {
          actor: agent.name,
          type: "agent.joined",
          payload: {
            name: agent.name,
            follow: agent.follow,
            leadership: agent.leadership,
            fingerprintSource: agent.fingerprintSource
          }
        })
      );
      agent.cursorEventId = latestEventId(state);
      await appendEvents(paths.workspaceDir!, events);
      await saveState(paths.workspaceDir!, state);
      return { state, agent, leader: agent, mode: "new-leader" };
    }

    const leaderResult = resolveLeader(state);
    if (leaderResult.warning) {
      warning = leaderResult.warning;
      const workspaceWarning = {
        code: "leader.selected",
        message: warning,
        createdAt: new Date().toISOString()
      };
      state.warnings.push(workspaceWarning);
      events.push(
        createEvent(state, {
          actor: leaderResult.leader.name,
          type: "warning.created",
          to: "all",
          payload: workspaceWarning
        })
      );
    }

    const leader = leaderResult.leader;
    const followerName = autoName(ctx, nextWorkerName(state));
    const { agent } = addOrRejoinAgent(state, {
      name: followerName,
      follow: leader.name,
      role: "follower engineer",
      cursorEventId: latestEventId(state),
      fingerprintHash: fingerprint.hash,
      fingerprintSource: fingerprint.source,
      autoNamed: !ctx.name && !process.env.CODEWORK_AGENT_NAME,
      leadership: "follower"
    });
    events.push(
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          follow: agent.follow,
          leadership: agent.leadership,
          fingerprintSource: agent.fingerprintSource
        }
      })
    );
    await appendEvents(paths.workspaceDir!, events);
    await saveState(paths.workspaceDir!, state);
    return { state, agent, leader, mode: "new-follower", warning };
  });
}

async function boundedAutoPoll(
  workspaceDir: string,
  agentName: string,
  settings: EnterSettings
): Promise<EnterPollRead> {
  const startedAt = Date.now();
  let read = await readAutoPoll(workspaceDir, agentName);
  while (
    read.actionableEvents.length === 0 &&
    !settings.once &&
    settings.waitSeconds > 0 &&
    Date.now() - startedAt < settings.waitSeconds * 1000
  ) {
    const remainingMs = startedAt + settings.waitSeconds * 1000 - Date.now();
    await sleep(Math.min(settings.intervalSeconds * 1000, Math.max(0, remainingMs)));
    read = await readAutoPoll(workspaceDir, agentName);
  }
  return finalizeAutoPoll(workspaceDir, agentName);
}

async function readAutoPoll(workspaceDir: string, agentName: string): Promise<EnterPollRead> {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await loadState(workspaceDir);
    if (!state) {
      throw new Error("workspace state disappeared during auto-enter");
    }
    const agent = findAgent(state, agentName);
    if (!agent) {
      throw new Error("agent state disappeared during auto-enter");
    }
    const leader = resolveLeader(state).leader;
    const events = relevantUnreadEvents(state, await readEvents(workspaceDir), agent);
    return splitAutoEvents(state, agent, leader, events);
  });
}

async function finalizeAutoPoll(workspaceDir: string, agentName: string): Promise<EnterPollRead> {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await loadState(workspaceDir);
    if (!state) {
      throw new Error("workspace state disappeared during auto-enter");
    }
    const agent = findAgent(state, agentName);
    if (!agent) {
      throw new Error("agent state disappeared during auto-enter");
    }
    const leader = resolveLeader(state).leader;
    const events = relevantUnreadEvents(state, await readEvents(workspaceDir), agent);
    const split = splitAutoEvents(state, agent, leader, events);
    const maxDisplayedEventId = events.reduce((max, event) => Math.max(max, event.id), 0);
    agent.cursorEventId = maxDisplayedEventId > 0 ? maxDisplayedEventId : latestEventId(state);
    agent.lastSeenAt = new Date().toISOString();
    agent.lastPollAt = agent.lastSeenAt;
    agent.lastPollCommand = "codework";
    agent.lastPollEmptyCount = split.actionableEvents.length > 0 ? 0 : (agent.lastPollEmptyCount ?? 0) + 1;
    state.updatedAt = agent.lastSeenAt;
    await saveState(workspaceDir, state);
    return splitAutoEvents(state, agent, leader, events);
  });
}

function splitAutoEvents(
  state: WorkspaceState,
  agent: AgentState,
  leader: AgentState,
  events: CodeworkEvent[]
): EnterPollRead {
  const actionableEvents = events.filter((event) => isAutoActionableEvent(agent, event));
  return {
    state,
    agent,
    leader,
    actionableEvents,
    nonActionableEvents: events.filter((event) => !isAutoActionableEvent(agent, event))
  };
}

function isAutoActionableEvent(agent: AgentState, event: CodeworkEvent): boolean {
  if (agent.leadership === "leader") {
    if (event.type === "warning.created") {
      return true;
    }
    if (event.type === "work.done" && event.actor !== agent.name) {
      return true;
    }
    return (
      event.type === "message.posted" &&
      (event.kind === "question" || event.kind === "blocker" || event.kind === "directive")
    );
  }
  return isActionableEvent(event, agent);
}

function resolveLeader(state: WorkspaceState): { leader: AgentState; warning?: string } {
  const explicit = state.leaderAgent ? findAgent(state, state.leaderAgent) : undefined;
  if (explicit?.active) {
    explicit.leadership = "leader";
    return { leader: explicit };
  }

  const activeAgents = Object.values(state.agents)
    .filter((agent) => agent.active)
    .sort((a, b) => (a.joinOrder ?? 0) - (b.joinOrder ?? 0) || a.joinedAt.localeCompare(b.joinedAt));
  const selected = activeAgents.find((agent) => agent.follow === "user") ?? activeAgents[0];
  if (!selected) {
    throw new Error("No active leader candidate exists.");
  }
  selected.leadership = "leader";
  selected.follow = selected.follow || "user";
  state.leaderAgent = selected.name;
  return {
    leader: selected,
    warning: "No explicit leader was found. Codework selected the earliest active participant as temporary leader."
  };
}

function autoName(ctx: CommandContext, fallback: string): string {
  const requested = ctx.name ?? process.env.CODEWORK_AGENT_NAME ?? fallback;
  return slugifyIdentifier(requested, "--name").value;
}

function nextWorkerName(state: WorkspaceState): string {
  const used = new Set(Object.values(state.agents).map((agent) => agent.name));
  let index = Math.max(2, Object.keys(state.agents).length + 1);
  while (used.has(`worker-${index}`)) {
    index += 1;
  }
  return `worker-${index}`;
}

function resultFromAutoEnter(
  registration: EnterRegistration,
  actionableEvents: CodeworkEvent[],
  nonActionableEvents: CodeworkEvent[],
  settings: EnterSettings
): CommandResult {
  return {
    text: renderAutoEnter({
      state: registration.state,
      agent: registration.agent,
      leader: registration.leader,
      actionableEvents,
      nonActionableEvents,
      waitSeconds: settings.waitSeconds,
      intervalSeconds: settings.intervalSeconds,
      consecutiveEmptyPolls: registration.agent.lastPollEmptyCount ?? 0,
      mode: registration.mode,
      warning: registration.warning
    }),
    quietText: `${registration.agent.leadership}=${registration.agent.name}\n`,
    json: {
      ok: true,
      command: "enter",
      workspace: registration.state.workspace,
      workspaceSlug: registration.state.workspaceSlug,
      agent: registration.agent,
      leader: registration.leader,
      actionableEvents,
      nonActionableEvents
    }
  };
}
