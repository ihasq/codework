import { appendEvents, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { createEvent, findAgent, latestEventId, requireState, saveState, touchAgent } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { CodeworkError, required, slugifyIdentifier, validateTextSize } from "../core/validate.ts";

export type DoneCommandOptions = {
  summary?: string;
  tests?: string;
  changed?: string;
  next?: string;
  blockers?: string;
};

export async function runDoneCommand(ctx: CommandContext, options: DoneCommandOptions): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const summary = validateTextSize(options.summary, "--summary");
  const payload = {
    summary,
    tests: optionalText(options.tests, "--tests"),
    changed: optionalText(options.changed, "--changed"),
    next: optionalText(options.next, "--next"),
    blockers: optionalText(options.blockers, "--blockers")
  };
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
      type: "work.done",
      to: "all",
      kind: payload.blockers ? "blocker" : undefined,
      payload
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
          `Work report recorded as event ${event.id}.`,
          "Notify your follow target if the report changes their next step.",
          `Run \`codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2\` before the next substantial step.`
        ],
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
      }),
      quietText: `event=${event.id} done\n`,
      json: {
        ok: true,
        command: "done",
        workspace: state.workspace,
        event
      }
    };
  });
}

function optionalText(value: string | undefined, optionName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return validateTextSize(value, optionName);
}
