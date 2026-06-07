import { readFile, appendFile } from "node:fs/promises";

import { eventsFilePath, latestEventId } from "./state.ts";
import type { AgentState, CodeworkEvent, WorkspaceState } from "./types.ts";
import { CodeworkError, slugifyIdentifier } from "./validate.ts";

export async function readEvents(workspaceDir: string): Promise<CodeworkEvent[]> {
  try {
    const raw = await readFile(eventsFilePath(workspaceDir), "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line, index) => {
        try {
          return JSON.parse(line) as CodeworkEvent;
        } catch {
          throw new CodeworkError(1, `Invalid JSON in events.ndjson at line ${index + 1}.`);
        }
      });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function appendEvents(workspaceDir: string, events: CodeworkEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const lines = events.map((event) => JSON.stringify(event)).join("\n");
  await appendFile(eventsFilePath(workspaceDir), `${lines}\n`, "utf8");
}

function targetMatchesAgent(to: string | undefined, agent: AgentState): boolean {
  if (!to || to === "all") {
    return true;
  }
  try {
    return slugifyIdentifier(to, "--to").slug === agent.slug;
  } catch {
    return to === agent.name;
  }
}

function isOwnOperationalEvent(event: CodeworkEvent, agent: AgentState): boolean {
  return event.actor === agent.name && event.type !== "warning.created";
}

export function relevantUnreadEvents(
  state: WorkspaceState,
  events: CodeworkEvent[],
  agent: AgentState,
  since?: number
): CodeworkEvent[] {
  const cursor = since ?? agent.cursorEventId;
  return events
    .filter((event) => event.id > cursor)
    .filter((event) => targetMatchesAgent(event.to, agent))
    .filter((event) => !isOwnOperationalEvent(event, agent))
    .sort((a, b) => priorityForEvent(state, agent, b) - priorityForEvent(state, agent, a) || a.id - b.id);
}

function priorityForEvent(state: WorkspaceState, agent: AgentState, event: CodeworkEvent): number {
  const follow = agent.follow;
  const fromFollow = follow !== "user" && follow !== "self" && event.actor === follow;
  if (event.kind === "blocker") {
    return 100;
  }
  if (fromFollow && event.kind === "directive") {
    return 90;
  }
  if (fromFollow && event.kind === "question") {
    return 80;
  }
  if (event.type === "warning.created") {
    return 70;
  }
  if (state.warnings.some((warning) => event.payload.message === warning.message)) {
    return 60;
  }
  return 0;
}

export function latestEvents(events: CodeworkEvent[], tail: number): CodeworkEvent[] {
  if (tail <= 0) {
    return [];
  }
  return events.slice(Math.max(0, events.length - tail));
}

export function advanceCursorToLatest(state: WorkspaceState, agent: AgentState): void {
  agent.cursorEventId = latestEventId(state);
  agent.lastSeenAt = new Date().toISOString();
  state.updatedAt = agent.lastSeenAt;
}

export function formatEvent(event: CodeworkEvent): string {
  const parts = [
    `id=${event.id}`,
    `ts=${event.ts}`,
    `type=${event.type}`,
    `actor=${event.actor}`,
    `to=${event.to ?? "all"}`
  ];
  if (event.kind) {
    parts.push(`kind=${event.kind}`);
  }
  const payload = compactPayload(event.payload);
  if (payload !== "") {
    parts.push(`payload=${payload}`);
  }
  return `- ${parts.join(" ")}`;
}

function compactPayload(payload: Record<string, unknown>): string {
  const keys = ["message", "summary", "tests", "changed", "next", "blockers", "reason", "role", "follow", "goal"];
  const rendered = keys
    .filter((key) => payload[key] !== undefined)
    .map((key) => `${key}=${JSON.stringify(payload[key])}`);
  const fallback = rendered.length > 0 ? rendered.join(" ") : JSON.stringify(payload);
  if (fallback.length <= 1200) {
    return fallback;
  }
  return `${fallback.slice(0, 1200)}...`;
}
