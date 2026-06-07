import { readEvents, relevantUnreadEvents, advanceCursorToLatest } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { findAgent, requireState, saveState } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { CodeworkError, parsePositiveInteger, required, slugifyIdentifier } from "../core/validate.ts";

export type PollCommandOptions = {
  since?: string;
  tail?: string;
};

export async function runPollCommand(ctx: CommandContext, options: PollCommandOptions): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const since = options.since === undefined ? undefined : parsePositiveInteger(options.since, "--since", 0);
  const tail = options.tail === undefined ? undefined : parsePositiveInteger(options.tail, "--tail", 0);
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

    const events = await readEvents(paths.workspaceDir!);
    const allUnread = relevantUnreadEvents(state, events, agent, since);
    const unread = tail === undefined ? allUnread : allUnread.slice(0, tail);
    advanceCursorToLatest(state, agent);
    await saveState(paths.workspaceDir!, state);

    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents: events,
        notice:
          unread.length === 0
            ? ["No unread events. Continue normal work, but keep polling before substantial changes."]
            : [`Unread events delivered: ${unread.length}. Cursor advanced to latest event.`],
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
      }),
      quietText: unread.length === 0 ? "unread=0\n" : `unread=${unread.length}\n`,
      json: {
        ok: true,
        command: "poll",
        workspace: state.workspace,
        agent,
        unreadEvents: unread,
        cursorEventId: agent.cursorEventId
      }
    };
  });
}
