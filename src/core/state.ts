import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { AgentState, CodeworkEvent, CodeworkPaths, EventType, MessageKind, WorkspaceState } from "./types.ts";
import { migrateWorkspaceState } from "./migrate.ts";
import { CodeworkError, slugifyIdentifier } from "./validate.ts";

export function nowIso(): string {
  return new Date().toISOString();
}

export function stateFilePath(workspaceDir: string): string {
  return path.join(workspaceDir, "state.json");
}

export function eventsFilePath(workspaceDir: string): string {
  return path.join(workspaceDir, "events.ndjson");
}

export function agentsDirPath(workspaceDir: string): string {
  return path.join(workspaceDir, "agents");
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, value, "utf8");
  await rename(tmpPath, filePath);
}

export async function loadState(workspaceDir: string): Promise<WorkspaceState | undefined> {
  try {
    const raw = await readFile(stateFilePath(workspaceDir), "utf8");
    return migrateWorkspaceState(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return undefined;
    }
    throw new CodeworkError(1, `Unable to read workspace state: ${(error as Error).message}`);
  }
}

export async function requireState(paths: CodeworkPaths): Promise<WorkspaceState> {
  if (!paths.workspaceDir) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }
  const state = await loadState(paths.workspaceDir);
  if (!state) {
    throw new CodeworkError(2, `Workspace does not exist: ${paths.workspace ?? "(unknown)"}`);
  }
  return state;
}

export async function saveState(workspaceDir: string, state: WorkspaceState): Promise<void> {
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(agentsDirPath(workspaceDir), { recursive: true });
  await writeJsonAtomic(stateFilePath(workspaceDir), state);
  await Promise.all(
    Object.values(state.agents).map((agent) =>
      writeJsonAtomic(path.join(agentsDirPath(workspaceDir), `${agent.slug}.json`), agent)
    )
  );
}

export async function resetWorkspaceFiles(workspaceDir: string): Promise<void> {
  await rm(stateFilePath(workspaceDir), { force: true });
  await rm(eventsFilePath(workspaceDir), { force: true });
  await rm(agentsDirPath(workspaceDir), { recursive: true, force: true });
}

export function createWorkspaceState(paths: CodeworkPaths, workspace: string): WorkspaceState {
  if (!paths.workspaceSlug) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }
  const ts = nowIso();
  return {
    schemaVersion: 2,
    workspace,
    workspaceSlug: paths.workspaceSlug,
    workspaceKind: paths.workspaceKind ?? "named",
    workspaceRoot: paths.workspaceRoot ?? paths.root,
    createdAt: ts,
    updatedAt: ts,
    root: paths.root,
    nextEventId: 1,
    agents: {},
    warnings: []
  };
}

export function addOrRejoinAgent(
  state: WorkspaceState,
  input: {
    name: string;
    follow: string;
    role?: string;
    cursorEventId?: number;
    fingerprintHash?: string;
    fingerprintSource?: string;
    autoNamed?: boolean;
    leadership?: "leader" | "follower";
  }
): { agent: AgentState; rejoin: boolean } {
  const slugged = slugifyIdentifier(input.name, "--name");
  const existing = state.agents[slugged.slug];
  const ts = nowIso();

  if (existing) {
    existing.follow = input.follow;
    existing.role = input.role || existing.role;
    existing.lastSeenAt = ts;
    existing.active = true;
    existing.sessionCount += 1;
    existing.fingerprintHash = input.fingerprintHash ?? existing.fingerprintHash;
    existing.fingerprintSource = input.fingerprintSource ?? existing.fingerprintSource;
    existing.autoNamed = input.autoNamed ?? existing.autoNamed;
    existing.leadership = input.leadership ?? existing.leadership;
    if (input.cursorEventId !== undefined) {
      existing.cursorEventId = input.cursorEventId;
    }
    state.updatedAt = ts;
    return { agent: existing, rejoin: true };
  }

  const agent: AgentState = {
    name: slugged.value,
    slug: slugged.slug,
    role: input.role,
    follow: input.follow,
    joinedAt: ts,
    lastSeenAt: ts,
    active: true,
    sessionCount: 1,
    cursorEventId: input.cursorEventId ?? 0,
    fingerprintHash: input.fingerprintHash,
    fingerprintSource: input.fingerprintSource,
    autoNamed: input.autoNamed,
    joinOrder: nextJoinOrder(state),
    leadership: input.leadership ?? "follower"
  };
  state.agents[agent.slug] = agent;
  state.updatedAt = ts;
  return { agent, rejoin: false };
}

export function nextJoinOrder(state: WorkspaceState): number {
  return Math.max(0, ...Object.values(state.agents).map((agent) => agent.joinOrder ?? 0)) + 1;
}

export function findAgent(state: WorkspaceState, name: string | undefined): AgentState | undefined {
  if (!name) {
    return undefined;
  }
  const slug = slugifyIdentifier(name, "--name").slug;
  return state.agents[slug];
}

export function findAgentByFollowValue(state: WorkspaceState, follow: string): AgentState | undefined {
  if (follow === "user" || follow === "self") {
    return undefined;
  }
  const slug = slugifyIdentifier(follow, "--follow").slug;
  return state.agents[slug];
}

export function touchAgent(state: WorkspaceState, name: string, cursorEventId?: number): AgentState {
  const agent = findAgent(state, name);
  if (!agent) {
    throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
  }
  agent.lastSeenAt = nowIso();
  if (cursorEventId !== undefined) {
    agent.cursorEventId = cursorEventId;
  }
  state.updatedAt = agent.lastSeenAt;
  return agent;
}

export function createEvent(
  state: WorkspaceState,
  input: {
    actor: string;
    type: EventType;
    to?: string;
    kind?: MessageKind;
    payload: Record<string, unknown>;
  }
): CodeworkEvent {
  const event: CodeworkEvent = {
    id: state.nextEventId,
    ts: nowIso(),
    workspace: state.workspace,
    actor: input.actor,
    type: input.type,
    payload: input.payload
  };
  if (input.to !== undefined) {
    event.to = input.to;
  }
  if (input.kind !== undefined) {
    event.kind = input.kind;
  }
  state.nextEventId += 1;
  state.updatedAt = event.ts;
  return event;
}

export function latestEventId(state: WorkspaceState): number {
  return state.nextEventId - 1;
}

export async function truncateEvents(workspaceDir: string): Promise<void> {
  await mkdir(workspaceDir, { recursive: true });
  await writeTextAtomic(eventsFilePath(workspaceDir), "");
}
