export type OutputFormat = "text" | "json";

export type ExitCode = 0 | 1 | 2 | 3;

export type CommandContext = {
  workspace?: string;
  name?: string;
  format: OutputFormat;
  quiet: boolean;
  debug: boolean;
  cwd: string;
  home?: string;
};

export type WorkspaceState = {
  schemaVersion: 1;
  workspace: string;
  workspaceSlug: string;
  createdAt: string;
  updatedAt: string;
  root: string;
  nextEventId: number;
  agents: Record<string, AgentState>;
  warnings: WorkspaceWarning[];
};

export type AgentState = {
  name: string;
  slug: string;
  role?: string;
  follow: string;
  joinedAt: string;
  lastSeenAt: string;
  active: boolean;
  sessionCount: number;
  cursorEventId: number;
  lastPollAt?: string;
  lastPollEmptyCount?: number;
  lastPollCommand?: string;
};

export type WorkspaceWarning = {
  code: string;
  message: string;
  createdAt: string;
};

export type EventType =
  | "workspace.created"
  | "agent.joined"
  | "agent.left"
  | "message.posted"
  | "work.done"
  | "warning.created";

export type MessageKind = "note" | "directive" | "question" | "blocker";

export type CodeworkEvent = {
  id: number;
  ts: string;
  workspace: string;
  actor: string;
  type: EventType;
  to?: string | "all";
  kind?: MessageKind;
  payload: Record<string, unknown>;
};

export type CodeworkPaths = {
  cwd: string;
  root: string;
  home: string;
  workspace?: string;
  workspaceSlug?: string;
  workspaceDir?: string;
};

export type CommandResult = {
  text: string;
  json: unknown;
  quietText?: string;
};
