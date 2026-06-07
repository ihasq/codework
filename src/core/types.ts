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

export type WorkspaceKind = "directory" | "named";

export type WorkspaceState = {
  schemaVersion: 2;
  workspace: string;
  workspaceSlug: string;
  workspaceKind: WorkspaceKind;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  root: string;
  nextEventId: number;
  leaderAgent?: string;
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
  fingerprintHash?: string;
  fingerprintSource?: string;
  autoNamed?: boolean;
  joinOrder: number;
  leadership: "leader" | "follower";
};

export type WorkspaceWarning = {
  code: string;
  message: string;
  createdAt: string;
};

export type EventType =
  | "workspace.created"
  | "agent.joined"
  | "agent.reidentified"
  | "agent.left"
  | "leader.assigned"
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
  workspaceKind?: WorkspaceKind;
  workspaceRoot?: string;
  workspaceHash?: string;
  workspaceDir?: string;
};

export type CommandResult = {
  text: string;
  json: unknown;
  quietText?: string;
};
