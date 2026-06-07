import { appendEvents, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { createEvent, findAgent, latestEventId, requireState, saveState, touchAgent } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { CodeworkError, required, slugifyIdentifier } from "../core/validate.ts";

export type LeaveCommandOptions = {
  reason?: string;
};

export async function runLeaveCommand(ctx: CommandContext, options: LeaveCommandOptions): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });

  return withWorkspaceLock(paths.workspaceDir!, async () => {
    const state = await requireState(paths);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    agent.active = false;
    const event = createEvent(state, {
      actor: agent.name,
      type: "agent.left",
      to: "all",
      payload: {
        reason: options.reason
      }
    });
    await appendEvents(paths.workspaceDir!, [event]);
    touchAgent(state, agent.name, latestEventId(state));
    await saveState(paths.workspaceDir!, state);
    const events = await readEvents(paths.workspaceDir!);
    const unread = relevantUnreadEvents(state, events, agent);

    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents: events,
        notice: [`Agent marked inactive: ${agent.name}.`],
        recommendedCommand: `codework status --workspace=${workspace.value}`
      }),
      quietText: `agent=${agent.name} inactive\n`,
      json: {
        ok: true,
        command: "leave",
        workspace: state.workspace,
        event
      }
    };
  });
}
