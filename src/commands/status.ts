import { readEvents, relevantUnreadEvents } from "../core/events.ts";
import { resolveAgentNameForCommand } from "../core/identity.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { findAgent, requireState } from "../core/state.ts";
import type { CodeworkEvent, CommandContext, CommandResult } from "../core/types.ts";

export async function runStatusCommand(ctx: CommandContext): Promise<CommandResult> {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const events = await readEvents(paths.workspaceDir!);
  const agentName = optionalAgentName(state, ctx);
  const agent = findAgent(state, agentName);
  const unread: CodeworkEvent[] = agent ? relevantUnreadEvents(state, events, agent) : [];
  const notice = [
    `Workspace root: ${state.root}.`,
    "Status includes all known agents, follow graph, latest events, warnings, and next command."
  ];
  if (ctx.name && !agent) {
    notice.push(`WARNING: calling agent is not registered: ${ctx.name}.`);
  }

  return {
    text: renderGuide({
      state,
      agentName,
      unreadEvents: unread,
      allEvents: events,
      notice,
      recommendedCommand: agent
        ? `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2`
        : "codework status",
      statusMode: true
    }),
    quietText: `workspace=${state.workspace} agents=${Object.keys(state.agents).length}\n`,
    json: {
      ok: true,
      command: "status",
      workspace: state.workspace,
      root: state.root,
      agents: state.agents,
      warnings: state.warnings,
      latestEvents: events.slice(-20)
    }
  };
}

function optionalAgentName(state: Parameters<typeof resolveAgentNameForCommand>[0], ctx: CommandContext): string | undefined {
  try {
    return resolveAgentNameForCommand(state, ctx);
  } catch {
    return ctx.name;
  }
}
