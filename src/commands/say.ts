import { appendEvents, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { createEvent, findAgent, latestEventId, requireState, saveState, touchAgent } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import {
  CodeworkError,
  normalizeTo,
  required,
  slugifyIdentifier,
  validateMessageKind,
  validateTextSize
} from "../core/validate.ts";

export type SayCommandOptions = {
  message?: string;
  to?: string;
  kind?: string;
};

export async function runSayCommand(ctx: CommandContext, options: SayCommandOptions): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const message = validateTextSize(options.message, "--message");
  const requestedTo = normalizeTo(options.to);
  const kind = validateMessageKind(options.kind ?? "note");
  const to = kind === "blocker" ? "all" : requestedTo;
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
    const event = createEvent(state, {
      actor: agent.name,
      type: "message.posted",
      to,
      kind,
      payload: {
        message,
        requestedTo
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
        notice: [
          `Message recorded: kind=${kind}, to=${to}.`,
          kind === "directive"
            ? "Directive messages must be treated as strong coordination instructions by recipients."
            : kind === "blocker"
              ? "Blocker messages are visible to all agents."
              : "Message is available through Codework poll/status/log."
        ],
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
      }),
      quietText: `event=${event.id} kind=${kind} to=${to}\n`,
      json: {
        ok: true,
        command: "say",
        workspace: state.workspace,
        event
      }
    };
  });
}
