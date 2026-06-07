import type { AgentState, WorkspaceState } from "./types.ts";

type LegacyWorkspaceState = Omit<WorkspaceState, "schemaVersion"> & {
  schemaVersion?: 1 | 2;
  workspaceKind?: WorkspaceState["workspaceKind"];
  workspaceRoot?: string;
  leaderAgent?: string;
};

type LegacyAgentState = AgentState & {
  joinOrder?: number;
  leadership?: "leader" | "follower";
};

export function migrateWorkspaceState(raw: unknown): WorkspaceState {
  const state = raw as LegacyWorkspaceState;
  const agents = Object.values(state.agents ?? {}) as LegacyAgentState[];
  const sortedAgents = [...agents].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const leader =
    state.leaderAgent ??
    sortedAgents.find((agent) => agent.follow === "user")?.name ??
    sortedAgents[0]?.name;

  sortedAgents.forEach((agent, index) => {
    agent.joinOrder = agent.joinOrder ?? index + 1;
    agent.leadership = agent.leadership ?? (agent.name === leader ? "leader" : "follower");
  });

  return {
    ...state,
    schemaVersion: 2,
    workspaceKind: state.workspaceKind ?? "named",
    workspaceRoot: state.workspaceRoot ?? state.root,
    leaderAgent: leader,
    agents: state.agents as WorkspaceState["agents"],
    warnings: state.warnings ?? []
  };
}
