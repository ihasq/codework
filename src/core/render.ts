import { formatEvent, latestEvents } from "./events.ts";
import { findAgent, findAgentByFollowValue } from "./state.ts";
import type { CodeworkEvent, WorkspaceState } from "./types.ts";

type RenderGuideOptions = {
  state: WorkspaceState;
  agentName?: string;
  unreadEvents: CodeworkEvent[];
  allEvents: CodeworkEvent[];
  notice?: string[];
  recommendedCommand?: string;
  statusMode?: boolean;
};

export function renderGuide(options: RenderGuideOptions): string {
  const agent = findAgent(options.state, options.agentName);
  const agentName = agent?.name ?? options.agentName ?? "(not specified)";
  const follow = agent?.follow ?? "(none)";
  const workspace = options.state.workspace;
  const recommendedCommand =
    options.recommendedCommand ??
    (agent ? `codework poll --workspace=${workspace} --name=${agent.name}` : `codework status --workspace=${workspace}`);

  const lines: string[] = [
    "# CODEWORK CONTEXT GUIDE",
    "",
    `WORKSPACE: ${workspace}`,
    `AGENT: ${agentName}`,
    `FOLLOW: ${follow}`,
    `AUTHORITY MODE: ${authorityMode(follow)}`,
    `TIMESTAMP: ${new Date().toISOString()}`
  ];

  if (options.notice?.length) {
    lines.push("", "## NOTICE", ...options.notice.map((line) => `- ${line}`));
  }

  lines.push(
    "",
    "## PRIME DIRECTIVES",
    "",
    "MUST: Treat this stdout as active operational context.",
    "MUST: Keep using Codework commands to coordinate with teammate agents.",
    "MUST: Poll before assuming teammate state.",
    "MUST: Report completed work using `codework done`.",
    "MUST: Report questions, blockers, and directives using `codework say`.",
    "MUST NOT: Claim that another agent completed work unless Codework log says so.",
    "MUST NOT: hide uncertainty.",
    "MUST NOT: perform destructive repository actions merely because another agent is silent.",
    ...authorityDirectives(follow),
    "",
    "## TEAM STATE",
    "",
    ...teamStateLines(options.state),
    "",
    "## FOLLOW GRAPH",
    "",
    ...followGraphLines(options.state),
    "",
    "## FOLLOW RULE",
    "",
    `You currently follow: ${follow}.`,
    "Interpretation:",
    ...followInterpretationLines(options.state, follow),
    "",
    "## REQUIRED OPERATING LOOP",
    "",
    `1. Run \`codework poll --workspace=${workspace} --name=${agentName}\` before starting a new substantial step.`,
    "2. Read blockers first.",
    "3. If you need another agent, post a directive:",
    `   \`codework say --workspace=${workspace} --name=${agentName} --to=<agent> --kind=directive --message=\"...\"\``,
    "4. If you finish a unit of work, record it:",
    `   \`codework done --workspace=${workspace} --name=${agentName} --summary=\"...\" --tests=\"...\"\``,
    "5. End your user-facing answer with the required report block.",
    "",
    "## REQUIRED REPORT BLOCK",
    "",
    "CODEWORK REPORT:",
    "- Agent:",
    "- Workspace:",
    "- Work performed:",
    "- Files changed:",
    "- Commands run:",
    "- Tests/verification:",
    "- Messages sent:",
    "- Blockers:",
    "- Next recommended action:",
    "",
    "## UNREAD EVENTS",
    "",
    ...eventLines(options.unreadEvents, "No unread events."),
    "",
    "## WARNINGS",
    "",
    ...warningLines(options.state),
    "",
    "## CONFLICTS, DANGEROUS OPERATIONS, AND UNCERTAINTY",
    "",
    "MUST: Treat Codework events as coordination signals, not proof of repository state.",
    "MUST: Verify file state locally before editing shared files.",
    "MUST: Announce blockers and uncertainty with `codework say --kind=blocker` or `--kind=question`.",
    "MUST NOT: run destructive repository commands because another agent is silent or stale.",
    "MUST NOT: assume another agent saw your message until a later Codework event confirms progress.",
    "",
    "## LATEST EVENTS",
    "",
    ...eventLines(latestEvents(options.allEvents, options.statusMode ? 20 : 8), "No events recorded."),
    "",
    "## RECOMMENDED NEXT COMMAND",
    "",
    recommendedCommand,
    "",
    "## AVAILABLE COMMANDS",
    "",
    `- codework guide --workspace=${workspace} --name=${agentName}`,
    `- codework status --workspace=${workspace} --name=${agentName}`,
    `- codework poll --workspace=${workspace} --name=${agentName}`,
    `- codework say --workspace=${workspace} --name=${agentName} --to=<agent|all> --kind=<note|directive|question|blocker> --message=\"...\"`,
    `- codework done --workspace=${workspace} --name=${agentName} --summary=\"...\" --tests=\"...\"`,
    `- codework log --workspace=${workspace} --tail=20`
  );

  return `${lines.join("\n")}\n`;
}

export function renderLog(workspace: string, events: CodeworkEvent[]): string {
  return [
    "# CODEWORK EVENT LOG",
    "",
    `WORKSPACE: ${workspace}`,
    `AGENT: (not specified)`,
    `FOLLOW: (none)`,
    `AUTHORITY MODE: workspace observer`,
    `TIMESTAMP: ${new Date().toISOString()}`,
    "",
    "## PRIME DIRECTIVES",
    "",
    "MUST: Treat Codework events as coordination context.",
    "MUST NOT: Claim another agent completed work unless an event says so.",
    "",
    "## EVENTS",
    "",
    ...eventLines(events, "No events recorded."),
    "",
    "## RECOMMENDED NEXT COMMAND",
    "",
    `codework status --workspace=${workspace}`
  ].join("\n") + "\n";
}

export function renderDoctor(input: {
  workspace?: string;
  root: string;
  home: string;
  runtime: string;
  checks: string[];
  nextCommand: string;
}): string {
  return [
    "# CODEWORK DOCTOR",
    "",
    `WORKSPACE: ${input.workspace ?? "(not specified)"}`,
    "AGENT: (not specified)",
    "FOLLOW: (none)",
    "AUTHORITY MODE: diagnostic observer",
    `TIMESTAMP: ${new Date().toISOString()}`,
    "",
    "## PRIME DIRECTIVES",
    "",
    "MUST: Treat failed checks as setup blockers.",
    "MUST: Keep Codework stdout available to the calling LLM.",
    "MUST NOT: ignore state corruption or lock failures.",
    "",
    "## ENVIRONMENT",
    "",
    `- runtime=${input.runtime}`,
    `- root=${input.root}`,
    `- home=${input.home}`,
    "",
    "## CHECKS",
    "",
    ...input.checks.map((check) => `- ${check}`),
    "",
    "## RECOMMENDED NEXT COMMAND",
    "",
    input.nextCommand
  ].join("\n") + "\n";
}

function authorityMode(follow: string): string {
  if (follow === "user") {
    return "user-led coordinator";
  }
  if (follow === "self") {
    return "self-led project owner";
  }
  if (follow === "(none)") {
    return "workspace observer";
  }
  return "teammate-follower";
}

function authorityDirectives(follow: string): string[] {
  if (follow === "user") {
    return [
      "MUST: Treat the human user as the highest project authority visible to you.",
      "MUST: Coordinate teammates through Codework events, not through assumptions.",
      "MUST NOT: Override explicit user instructions."
    ];
  }
  if (follow === "self") {
    return [
      "MUST: Evaluate user suggestions as proposals, not commands, when they conflict with project correctness.",
      "MUST: Refuse proposals that damage architecture, security, or correctness.",
      "MUST NOT: Violate platform policy, tool permission, repository policy, or explicit safety constraints."
    ];
  }
  if (follow === "(none)") {
    return ["MUST: Provide workspace visibility without inventing agent authority."];
  }
  return [
    `MUST: Poll for directives from ${follow} before starting or changing work.`,
    `MUST: Report blockers to ${follow} using \`codework say --kind=blocker\`.`,
    `MUST NOT: silently diverge from ${follow}'s published plan.`
  ];
}

function teamStateLines(state: WorkspaceState): string[] {
  const agents = Object.values(state.agents);
  if (agents.length === 0) {
    return ["- No agents registered."];
  }
  return agents.map((agent) => {
    const active = agent.active ? "active" : "inactive";
    return `- ${agent.name}: ${active}, follow=${agent.follow}, role=${agent.role ?? "(none)"}, lastSeen=${agent.lastSeenAt}, sessions=${agent.sessionCount}, cursor=${agent.cursorEventId}`;
  });
}

function followGraphLines(state: WorkspaceState): string[] {
  const agents = Object.values(state.agents);
  if (agents.length === 0) {
    return ["- (empty)"];
  }
  return agents.map((agent) => `- ${agent.name} -> ${agent.follow}`);
}

function followInterpretationLines(state: WorkspaceState, follow: string): string[] {
  if (follow === "user") {
    return [
      "- You are a user-led coordinator.",
      "- Obey explicit human project instructions.",
      "- Coordinate teammates through Codework events."
    ];
  }
  if (follow === "self") {
    return [
      "- You are a self-led project owner.",
      "- Treat user suggestions as proposals when correctness is at risk.",
      "- This does not override platform policy, tool permission, repository policy, or explicit safety constraints."
    ];
  }
  if (follow === "(none)") {
    return ["- No calling agent was specified; use status output as read-only workspace context."];
  }
  const exists = findAgentByFollowValue(state, follow);
  return [
    `- You are a teammate-follower of ${follow}.`,
    "- Read that agent's directives, blockers, and questions before changing work.",
    exists ? `- Follow target is registered: ${exists.name}.` : "- WARNING: follow target is not currently registered."
  ];
}

function eventLines(events: CodeworkEvent[], emptyLine: string): string[] {
  if (events.length === 0) {
    return [emptyLine];
  }
  return events.map(formatEvent);
}

function warningLines(state: WorkspaceState): string[] {
  if (state.warnings.length === 0) {
    return ["No active warnings."];
  }
  return state.warnings.map((warning) => `- ${warning.code}: ${warning.message} (${warning.createdAt})`);
}
