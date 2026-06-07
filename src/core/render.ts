import { buildCanonicalPollCommand } from "./command.ts";
import { formatEvent, latestEvents } from "./events.ts";
import { findAgent, findAgentByFollowValue } from "./state.ts";
import type { AgentState, CodeworkEvent, WorkspaceState } from "./types.ts";

type RenderGuideOptions = {
  state: WorkspaceState;
  agentName?: string;
  unreadEvents: CodeworkEvent[];
  allEvents: CodeworkEvent[];
  notice?: string[];
  recommendedCommand?: string;
  statusMode?: boolean;
};

export type PollRenderResult = "actionable-events-found" | "timeout-without-actionable-event";

export type RenderPollResultOptions = {
  title: "# CODEWORK POLL RESULT" | "# CODEWORK WAIT RESULT";
  state: WorkspaceState;
  agent: AgentState;
  actionableEvents: CodeworkEvent[];
  nonActionableEvents: CodeworkEvent[];
  waitSeconds: number;
  intervalSeconds: number;
  pollResult: PollRenderResult;
  canonicalCommand: string;
  nextPollCommand: string;
};

export function renderGuide(options: RenderGuideOptions): string {
  const agent = findAgent(options.state, options.agentName);
  const agentName = agent?.name ?? options.agentName ?? "(not specified)";
  const follow = agent?.follow ?? "(none)";
  const workspace = options.state.workspace;
  const recommendedCommand =
    options.recommendedCommand ??
    (agent ? defaultPollCommand(workspace, agent.name) : `codework status --workspace=${workspace}`);

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
    ...waitingForFollowTargetLines(options.state, agent, workspace),
    "",
    "## REQUIRED OPERATING LOOP",
    "",
    `1. Run \`${agent ? defaultPollCommand(workspace, agent.name) : `codework poll --workspace=${workspace} --name=${agentName} --wait=30 --interval=2`}\` before starting a new substantial step.`,
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
    ...eventLines(options.unreadEvents, "No actionable unread events are shown here. Use the poll command below to wait for peer events."),
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
    `- codework poll --workspace=${workspace} --name=${agentName} --wait=30 --interval=2`,
    `- codework wait --workspace=${workspace} --name=${agentName} --wait=30 --interval=2`,
    `- codework say --workspace=${workspace} --name=${agentName} --to=<agent|all> --kind=<note|directive|question|blocker> --message=\"...\"`,
    `- codework done --workspace=${workspace} --name=${agentName} --summary=\"...\" --tests=\"...\"`,
    `- codework log --workspace=${workspace} --tail=20`
  );

  return `${lines.join("\n")}\n`;
}

export function renderPollResult(options: RenderPollResultOptions): string {
  const follow = options.agent.follow;
  const lines = [
    options.title,
    "",
    `WORKSPACE: ${options.state.workspace}`,
    `AGENT: ${options.agent.name}`,
    `FOLLOW: ${follow}`,
    `AUTHORITY MODE: ${authorityMode(follow)}`,
    `TIMESTAMP: ${new Date().toISOString()}`,
    `POLL WINDOW: ${formatPollSeconds(options.waitSeconds)}`,
    `POLL INTERVAL: ${formatPollSeconds(options.intervalSeconds)}`,
    `POLL RESULT: ${options.pollResult}`,
    `CONSECUTIVE EMPTY POLLS: ${options.agent.lastPollEmptyCount ?? 0}`,
    "",
    "## TEAM STATE",
    "",
    ...teamStateLines(options.state),
    "",
    "## FOLLOW RULE",
    "",
    `You currently follow: ${follow}.`,
    ...pollFollowRuleLines(follow)
  ];

  if (options.actionableEvents.length > 0) {
    lines.push(
      "",
      "## ACTIONABLE EVENTS",
      "",
      ...structuredEventLines(options.actionableEvents),
      "",
      "## REQUIRED NEXT ACTION",
      "",
      "MUST: Handle the actionable event above before polling again.",
      follow !== "user" && follow !== "self"
        ? `MUST: Follow directives from ${follow} because your follow target is ${follow}.`
        : "MUST: Apply the actionable event according to your authority mode and the human's current instruction.",
      `MUST: If blocked, send \`codework say --workspace=${options.state.workspace} --name=${options.agent.name} --to=${followTargetForCommand(follow)} --kind=blocker --message=\"...\"\``,
      `MUST: If complete, send \`codework done --workspace=${options.state.workspace} --name=${options.agent.name} --summary=\"...\" --tests=\"...\"\``,
      "MUST NOT: ignore this directive and continue waiting.",
      "",
      "NEXT POLL COMMAND AFTER HANDLING:",
      options.nextPollCommand
    );
  } else {
    lines.push(
      "",
      "## NO ACTIONABLE EVENTS",
      "",
      "No actionable events arrived during this poll window."
    );
    if (options.nonActionableEvents.length > 0) {
      lines.push(
        "",
        "## OBSERVED NON-ACTIONABLE EVENTS",
        "",
        ...structuredEventLines(options.nonActionableEvents)
      );
    }
    lines.push(
      "",
      "## WAIT CONTINUATION REQUIRED",
      "",
      "STATE: waiting-for-peer-event",
      "MUST: Run the exact command below again.",
      "MUST: Continue repeating it until an actionable event appears, the human gives a new instruction, or you explicitly report that you are still waiting.",
      "MUST NOT: treat this empty poll as task completion.",
      "MUST NOT: invent teammate state.",
      "MUST NOT: start unrelated work merely because no event arrived.",
      "",
      "RE-RUN EXACT COMMAND:",
      options.canonicalCommand,
      "",
      "## REPORTING RULE",
      "",
      "If you decide to speak to the human while still waiting, use this exact report shape:",
      "",
      "CODEWORK WAITING REPORT:",
      `- Agent: ${options.agent.name}`,
      `- Workspace: ${options.state.workspace}`,
      `- Waiting for: ${waitingForText(follow)}`,
      `- Consecutive empty polls: ${options.agent.lastPollEmptyCount ?? 0}`,
      `- Last poll command: ${options.canonicalCommand}`,
      "- Next action: run the same poll command again"
    );
  }

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
    const poll = agent.lastPollAt
      ? `, lastPoll=${agent.lastPollAt}, emptyPolls=${agent.lastPollEmptyCount ?? 0}`
      : "";
    return `- ${agent.name}: ${active}, follow=${agent.follow}, role=${agent.role ?? "(none)"}, lastSeen=${agent.lastSeenAt}, sessions=${agent.sessionCount}, cursor=${agent.cursorEventId}${poll}`;
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

function waitingForFollowTargetLines(state: WorkspaceState, agent: AgentState | undefined, workspace: string): string[] {
  if (!agent || agent.follow === "user" || agent.follow === "self") {
    return [];
  }
  const command = defaultPollCommand(workspace, agent.name);
  return [
    "",
    "## WAITING FOR FOLLOW TARGET",
    "",
    `STATE: waiting-for-directive-from-${agent.follow}`,
    `MUST: Poll for directives from ${agent.follow} before starting implementation.`,
    "MUST: Run the command below now.",
    `MUST NOT: begin implementation based only on the human's vague request if ${agent.follow} is your follow target.`,
    "",
    "RUN COMMAND:",
    command,
    "",
    findAgentByFollowValue(state, agent.follow)
      ? `FOLLOW TARGET STATUS: ${agent.follow} is registered.`
      : `FOLLOW TARGET STATUS: ${agent.follow} is not registered yet; keep polling until directives arrive.`
  ];
}

function defaultPollCommand(workspace: string, name: string): string {
  return buildCanonicalPollCommand({
    kind: "poll",
    workspace,
    name,
    waitSeconds: 30,
    intervalSeconds: 2
  });
}

function pollFollowRuleLines(follow: string): string[] {
  if (follow === "user") {
    return [
      "MUST: Wait for directives, questions, blockers, or completion signals from the workspace.",
      "MUST NOT: infer teammate state from silence."
    ];
  }
  if (follow === "self") {
    return [
      "MUST: Wait for actionable peer events before making claims about teammate progress.",
      "MUST NOT: infer teammate state from silence."
    ];
  }
  return [
    `MUST: Wait for directives, questions, blockers, or completion signals from ${follow}.`,
    `MUST NOT: infer ${follow}'s intent from silence.`
  ];
}

function structuredEventLines(events: CodeworkEvent[]): string[] {
  return events.flatMap((event) => {
    const lines = [
      `Event ${event.id}:`,
      `- TYPE: ${event.type}`,
      `- FROM: ${event.actor}`,
      `- TO: ${event.to ?? "all"}`
    ];
    if (event.kind) {
      lines.push(`- KIND: ${event.kind}`);
    }
    const message = eventText(event);
    if (message !== "") {
      lines.push("- MESSAGE:", ...indentMultiline(message));
    }
    return [...lines, ""];
  }).slice(0, -1);
}

function eventText(event: CodeworkEvent): string {
  const keys = ["message", "summary", "blockers", "next", "reason"];
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return JSON.stringify(event.payload);
}

function indentMultiline(value: string): string[] {
  return value.split(/\r?\n/).map((line) => `  ${line}`);
}

function followTargetForCommand(follow: string): string {
  return follow === "self" || follow === "user" ? "all" : follow;
}

function waitingForText(follow: string): string {
  if (follow === "user" || follow === "self") {
    return "actionable workspace event";
  }
  return `directive or actionable event from ${follow}`;
}

function formatPollSeconds(value: number): string {
  return `${Number.isInteger(value) ? value : String(value)}s`;
}
