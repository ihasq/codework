import { readEvents, latestEvents } from "../core/events.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderLog } from "../core/render.ts";
import { requireState } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { parsePositiveInteger, slugifyIdentifier } from "../core/validate.ts";

export type LogCommandOptions = {
  tail?: string;
  json?: boolean;
};

export async function runLogCommand(ctx: CommandContext, options: LogCommandOptions): Promise<CommandResult> {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const tail = parsePositiveInteger(options.tail, "--tail", 50);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const events = latestEvents(await readEvents(paths.workspaceDir!), tail);

  return {
    text: renderLog(state.workspace, events),
    quietText: `events=${events.length}\n`,
    json: {
      ok: true,
      command: "log",
      workspace: state.workspace,
      events
    }
  };
}
