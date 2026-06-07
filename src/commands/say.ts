import { appendEvents, readEvents, relevantUnreadEvents } from "../core/events.ts";
import { identityRequiredStdout, resolveAgentNameForCommand } from "../core/identity.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderGuide } from "../core/render.ts";
import { createEvent, findAgent, latestEventId, loadState, saveState, touchAgent } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import {
  CodeworkError,
  normalizeTo,
  validateMessageKind,
  validateTextSize
} from "../core/validate.ts";

export type SayCommandOptions = {
  positionalTo?: string;
  positionalMessage?: string;
  message?: string;
  to?: string;
  kind?: string;
};

export async function runSayCommand(ctx: CommandContext, options: SayCommandOptions): Promise<CommandResult> {
  const message = validateTextSize(options.message ?? options.positionalMessage, "--message");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });

  return withWorkspaceLock(paths.workspaceDir!, async () => {
    const state = await loadState(paths.workspaceDir!);
    if (!state) {
      if (!ctx.name) {
        throw new CodeworkError(2, "Agent identity is required.", identityRequiredStdout());
      }
      throw new CodeworkError(2, `Workspace does not exist: ${paths.workspace ?? "(unknown)"}`);
    }
    const name = resolveAgentNameForCommand(state, ctx);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const requestedTo = normalizeTo(options.positionalTo ?? options.to);
    const kind = validateMessageKind(options.kind ?? defaultMessageKind(state, agent, requestedTo));
    const to = kind === "blocker" ? "all" : requestedTo;
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
        recommendedCommand: `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2`
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

function defaultMessageKind(state: { agents: Record<string, { leadership?: string; name: string }> }, agent: { leadership?: string }, to: string): "note" | "directive" {
  const target = Object.values(state.agents).find((candidate) => candidate.name === to);
  return agent.leadership === "leader" && target?.leadership === "follower" ? "directive" : "note";
}
