import process from "node:process";

import { buildCanonicalPollCommand, type PollCommandKind } from "../core/command.ts";
import { isActionableEvent, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderPollResult, type PollRenderResult } from "../core/render.ts";
import { findAgent, latestEventId, requireState, saveState } from "../core/state.ts";
import type { AgentState, CodeworkEvent, CommandContext, CommandResult, WorkspaceState } from "../core/types.ts";
import {
  CodeworkError,
  parseBoundedSeconds,
  parsePositiveInteger,
  required,
  slugifyIdentifier
} from "../core/validate.ts";

export type PollCommandOptions = {
  since?: string;
  tail?: string;
  wait?: string;
  interval?: string;
  once?: boolean;
};

type PollSettings = {
  waitSeconds: number;
  intervalSeconds: number;
  once: boolean;
  tail?: number;
  since?: number;
};

type PollReadResult = {
  state: WorkspaceState;
  agent: AgentState;
  displayedEvents: CodeworkEvent[];
  actionableEvents: CodeworkEvent[];
  nonActionableEvents: CodeworkEvent[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runPollCommand(
  ctx: CommandContext,
  options: PollCommandOptions,
  commandKind: PollCommandKind = "poll"
): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const settings = normalizePollSettings(options);
  const canonicalCommand = buildCanonicalPollCommand({
    kind: commandKind,
    workspace: workspace.value,
    name,
    waitSeconds: settings.waitSeconds,
    intervalSeconds: settings.intervalSeconds
  });
  const nextPollCommand = buildCanonicalPollCommand({
    kind: "poll",
    workspace: workspace.value,
    name,
    waitSeconds: settings.waitSeconds,
    intervalSeconds: settings.intervalSeconds
  });
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });

  const startedAt = Date.now();
  let readResult: PollReadResult;
  while (true) {
    readResult = await readPollEvents(paths.workspaceDir!, name, settings);
    if (readResult.actionableEvents.length > 0 || settings.once || settings.waitSeconds === 0) {
      break;
    }
    const remainingMs = startedAt + settings.waitSeconds * 1000 - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(settings.intervalSeconds * 1000, remainingMs));
  }

  const finalResult = await finalizePoll(paths.workspaceDir!, name, settings, canonicalCommand);
  const pollResult: PollRenderResult =
    finalResult.actionableEvents.length > 0 ? "actionable-events-found" : "timeout-without-actionable-event";

  return {
    text: renderPollResult({
      title: commandKind === "wait" ? "# CODEWORK WAIT RESULT" : "# CODEWORK POLL RESULT",
      state: finalResult.state,
      agent: finalResult.agent,
      actionableEvents: finalResult.actionableEvents,
      nonActionableEvents: finalResult.nonActionableEvents,
      waitSeconds: settings.once ? 0 : settings.waitSeconds,
      intervalSeconds: settings.intervalSeconds,
      pollResult,
      canonicalCommand,
      nextPollCommand
    }),
    quietText:
      finalResult.actionableEvents.length === 0
        ? `actionable=0 emptyPolls=${finalResult.agent.lastPollEmptyCount ?? 0}\n`
        : `actionable=${finalResult.actionableEvents.length}\n`,
    json: {
      ok: true,
      command: commandKind,
      workspace: finalResult.state.workspace,
      agent: finalResult.agent,
      pollResult,
      waitSeconds: settings.waitSeconds,
      intervalSeconds: settings.intervalSeconds,
      actionableEvents: finalResult.actionableEvents,
      nonActionableEvents: finalResult.nonActionableEvents,
      cursorEventId: finalResult.agent.cursorEventId,
      canonicalCommand
    }
  };
}

function normalizePollSettings(options: PollCommandOptions): PollSettings {
  const waitSeconds = options.once
    ? 0
    : parseBoundedSeconds({
        cliValue: options.wait,
        envValue: process.env.CODEWORK_POLL_WAIT_SECONDS,
        optionName: "--wait",
        fallback: 30,
        min: 0,
        max: 120
      });
  const intervalSeconds = parseBoundedSeconds({
    cliValue: options.interval,
    envValue: process.env.CODEWORK_POLL_INTERVAL_SECONDS,
    optionName: "--interval",
    fallback: 2,
    min: 1,
    max: 10
  });
  return {
    waitSeconds,
    intervalSeconds,
    once: Boolean(options.once),
    since: options.since === undefined ? undefined : parsePositiveInteger(options.since, "--since", 0),
    tail: options.tail === undefined ? undefined : parsePositiveInteger(options.tail, "--tail", 0)
  };
}

async function readPollEvents(workspaceDir: string, name: string, settings: PollSettings): Promise<PollReadResult> {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await requireState({ workspaceDir, cwd: "", root: "", home: "" });
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const events = await readEvents(workspaceDir);
    return buildPollReadResult(state, agent, events, settings);
  });
}

async function finalizePoll(
  workspaceDir: string,
  name: string,
  settings: PollSettings,
  canonicalCommand: string
): Promise<PollReadResult> {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await requireState({ workspaceDir, cwd: "", root: "", home: "" });
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const events = await readEvents(workspaceDir);
    const result = buildPollReadResult(state, agent, events, settings);
    const maxDisplayedEventId = result.displayedEvents.reduce((max, event) => Math.max(max, event.id), 0);
    agent.cursorEventId = maxDisplayedEventId > 0 ? maxDisplayedEventId : latestEventId(state);
    agent.lastSeenAt = new Date().toISOString();
    agent.lastPollAt = agent.lastSeenAt;
    agent.lastPollCommand = canonicalCommand;
    agent.lastPollEmptyCount =
      result.actionableEvents.length > 0 ? 0 : (agent.lastPollEmptyCount ?? 0) + 1;
    state.updatedAt = agent.lastSeenAt;
    await saveState(workspaceDir, state);
    return result;
  });
}

function buildPollReadResult(
  state: WorkspaceState,
  agent: AgentState,
  allEvents: CodeworkEvent[],
  settings: PollSettings
): PollReadResult {
  const unread = relevantUnreadEvents(state, allEvents, agent, settings.since);
  const displayedEvents = settings.tail === undefined ? unread : unread.slice(0, settings.tail);
  const actionableEvents = displayedEvents.filter((event) => isActionableEvent(event, agent));
  const nonActionableEvents = displayedEvents.filter((event) => !isActionableEvent(event, agent));
  return {
    state,
    agent,
    displayedEvents,
    actionableEvents,
    nonActionableEvents
  };
}
