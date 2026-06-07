import { runPollCommand, type PollCommandOptions } from "./poll.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";

export async function runWaitCommand(ctx: CommandContext, options: PollCommandOptions): Promise<CommandResult> {
  return runPollCommand(ctx, options, "wait");
}
