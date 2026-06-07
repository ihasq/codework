import { readEvents, relevantUnreadEvents } from "../core/events.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { findAgent, requireState } from "../core/state.ts";
import type { CodeworkEvent, CommandContext, CommandResult } from "../core/types.ts";
import { slugifyIdentifier } from "../core/validate.ts";

export async function runStatusCommand(ctx: CommandContext): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const events = await readEvents(paths.workspaceDir!);
  const agent = findAgent(state, ctx.name);
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
      agentName: ctx.name,
      unreadEvents: unread,
      allEvents: events,
      notice,
      recommendedCommand: agent
        ? `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
        : `codework status --workspace=${workspace.value} --name=<agent>`,
      statusMode: true
    }),
    quietText: `workspace=${workspace.value} agents=${Object.keys(state.agents).length}\n`,
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
