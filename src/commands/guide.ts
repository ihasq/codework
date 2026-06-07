import { readEvents, relevantUnreadEvents } from "../core/events.ts";
import { resolveAgentNameForCommand } from "../core/identity.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { findAgent, requireState } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { CodeworkError } from "../core/validate.ts";

export async function runGuideCommand(ctx: CommandContext): Promise<CommandResult> {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const name = resolveAgentNameForCommand(state, ctx);
  const agent = findAgent(state, name);
  if (!agent) {
    throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
  }
  const events = await readEvents(paths.workspaceDir!);
  const unread = relevantUnreadEvents(state, events, agent);

  return {
    text: renderGuide({
      state,
      agentName: agent.name,
      unreadEvents: unread,
      allEvents: events,
      notice: ["Full guide reprinted for the calling agent."],
      recommendedCommand: `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2`
    }),
    quietText: `workspace=${state.workspace} agent=${agent.name} guide\n`,
    json: {
      ok: true,
      command: "guide",
      workspace: state.workspace,
      agent,
      unreadEvents: unread
    }
  };
}
