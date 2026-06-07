#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import process from "node:process";

import { preprocessArgv } from "./args.ts";
import { runDoctorCommand } from "./commands/doctor.ts";
import { runDoneCommand } from "./commands/done.ts";
import { runGuideCommand } from "./commands/guide.ts";
import { runJoinCommand, requireJoinOptions } from "./commands/join.ts";
import { runLeaveCommand } from "./commands/leave.ts";
import { runLogCommand } from "./commands/log.ts";
import { runNewCommand, requireNewOptions } from "./commands/new.ts";
import { runPollCommand } from "./commands/poll.ts";
import { runSayCommand } from "./commands/say.ts";
import { runStatusCommand } from "./commands/status.ts";
import type { CommandContext, CommandResult, ExitCode } from "./core/types.ts";
import { CodeworkError, validateFormat } from "./core/validate.ts";

type Io = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

type CommonOptionShape = {
  workspace?: string;
  name?: string;
  format?: string;
  quiet?: boolean;
  debug?: boolean;
  cwd?: string;
  home?: string;
  color?: boolean;
};

const defaultIo: Io = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text)
};

export async function main(argv = process.argv, io: Io = defaultIo): Promise<ExitCode> {
  const program = buildProgram(io);
  const parsedArgv = [argv[0] ?? "node", argv[1] ?? "codework", ...preprocessArgv(argv.slice(2))];

  try {
    await program.parseAsync(parsedArgv, { from: "node" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed") {
        return 0;
      }
      emitError(io, parsedArgv, new CodeworkError(2, error.message));
      return 2;
    }
    if (error instanceof CodeworkError) {
      emitError(io, parsedArgv, error);
      return error.exitCode;
    }

    const debug = parsedArgv.includes("--debug");
    if (debug) {
      io.stderr(`${(error as Error).stack ?? String(error)}\n`);
    }
    emitError(io, parsedArgv, new CodeworkError(1, `Internal error: ${(error as Error).message}`));
    return 1;
  }
}

function buildProgram(io: Io): Command {
  const program = new Command();
  program
    .name("codework")
    .description("Coordinate multiple AI coding agents through stdout-as-context.")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stdout(text)
    });
  addCommonOptions(program, true);

  addCommonOptions(program.command("new").description("Create a new Codework workspace and register the first agent."))
    .option("--follow <user|self|agent>", "Authority/follow target.")
    .option("--role <text>", "Agent role.")
    .option("--goal <text>", "Workspace goal.")
    .option("--force", "Recreate an existing workspace.")
    .action(async function (this: Command) {
      const options = this.opts();
      requireNewOptions(options);
      await emitResult(io, contextFrom(this), await runNewCommand(contextFrom(this), options));
    });

  addCommonOptions(program.command("join").description("Join an existing Codework workspace."))
    .option("--follow <user|self|agent>", "Authority/follow target.")
    .option("--role <text>", "Agent role.")
    .action(async function (this: Command) {
      const options = this.opts();
      requireJoinOptions(options);
      await emitResult(io, contextFrom(this), await runJoinCommand(contextFrom(this), options));
    });

  addCommonOptions(program.command("guide").description("Reprint the complete operational guide for an agent.")).action(
    async function (this: Command) {
      await emitResult(io, contextFrom(this), await runGuideCommand(contextFrom(this)));
    }
  );

  addCommonOptions(program.command("status").description("Print workspace state, agents, follow graph, and latest events.")).action(
    async function (this: Command) {
      await emitResult(io, contextFrom(this), await runStatusCommand(contextFrom(this)));
    }
  );

  addCommonOptions(program.command("poll").description("Read unread events for the calling agent."))
    .option("--since <eventId>", "Read events after this event id.")
    .option("--tail <n>", "Limit unread events.")
    .action(async function (this: Command) {
      await emitResult(io, contextFrom(this), await runPollCommand(contextFrom(this), this.opts()));
    });

  addCommonOptions(program.command("say").description("Post a message event to the workspace."))
    .option("--message <text>", "Message body.")
    .option("--to <agent|all>", "Recipient.", "all")
    .option("--kind <note|directive|question|blocker>", "Message kind.", "note")
    .action(async function (this: Command) {
      await emitResult(io, contextFrom(this), await runSayCommand(contextFrom(this), this.opts()));
    });

  addCommonOptions(program.command("done").description("Record completed or intermediate work."))
    .option("--summary <text>", "Work summary.")
    .option("--tests <text>", "Tests or verification.")
    .option("--changed <text>", "Files or areas changed.")
    .option("--next <text>", "Next step.")
    .option("--blockers <text>", "Remaining blockers.")
    .action(async function (this: Command) {
      await emitResult(io, contextFrom(this), await runDoneCommand(contextFrom(this), this.opts()));
    });

  addCommonOptions(program.command("log").description("Read workspace event log."))
    .option("--tail <n>", "Number of latest events.", "50")
    .option("--json", "Emit JSON for log command.")
    .action(async function (this: Command) {
      const ctx = contextFrom(this);
      const result = await runLogCommand(ctx, this.opts());
      const local = this.opts() as { json?: boolean };
      await emitResult(io, local.json ? { ...ctx, format: "json" } : ctx, result);
    });

  addCommonOptions(program.command("leave").description("Mark an agent inactive."))
    .option("--reason <text>", "Reason for leaving.")
    .action(async function (this: Command) {
      await emitResult(io, contextFrom(this), await runLeaveCommand(contextFrom(this), this.opts()));
    });

  addCommonOptions(program.command("doctor").description("Check runtime, write access, lock behavior, and state integrity.")).action(
    async function (this: Command) {
      await emitResult(io, contextFrom(this), await runDoctorCommand(contextFrom(this)));
    }
  );

  return program;
}

function addCommonOptions(command: Command, withDefaults = false): Command {
  command
    .option("--workspace <id>", "Workspace id.")
    .option("--name <agent>", "Calling agent name.")
    .option("--format <format>", "text | json.", withDefaults ? "text" : undefined)
    .option("--quiet", "Only print machine/minimal output.")
    .option("--debug", "Print diagnostics to stderr.")
    .option("--cwd <path>", "Repository/work root.", withDefaults ? process.cwd() : undefined)
    .option("--home <path>", "Override Codework home.")
    .option("--no-color", "Do not emit ANSI color.");
  return command;
}

function contextFrom(command: Command): CommandContext {
  const parent = (command.parent?.opts() ?? {}) as CommonOptionShape;
  const local = command.opts() as CommonOptionShape;
  const merged: CommonOptionShape = {
    ...parent,
    ...Object.fromEntries(Object.entries(local).filter(([, value]) => value !== undefined))
  };
  return {
    workspace: merged.workspace,
    name: merged.name,
    format: validateFormat(merged.format),
    quiet: Boolean(merged.quiet),
    debug: Boolean(merged.debug),
    cwd: merged.cwd ?? process.cwd(),
    home: merged.home
  };
}

async function emitResult(io: Io, ctx: CommandContext, result: CommandResult): Promise<void> {
  if (ctx.format === "json") {
    io.stdout(`${JSON.stringify(result.json, null, 2)}\n`);
    return;
  }
  if (ctx.quiet) {
    io.stdout(result.quietText ?? "ok\n");
    return;
  }
  io.stdout(result.text);
}

function emitError(io: Io, argv: string[], error: CodeworkError): void {
  const format = requestedFormat(argv);
  if (format === "json") {
    io.stdout(`${JSON.stringify({ ok: false, exitCode: error.exitCode, error: error.message }, null, 2)}\n`);
    return;
  }

  io.stdout(
    [
      "# CODEWORK ERROR",
      "",
      `EXIT CODE: ${error.exitCode}`,
      `MESSAGE: ${error.message}`,
      "",
      "MUST: Treat this stdout as the user-visible Codework error.",
      "MUST: Fix the command arguments or workspace state before retrying.",
      "MUST NOT: ignore this failure or assume shared state changed.",
      "",
      "NEXT COMMAND:",
      "codework guide --workspace=<id> --name=<agent>"
    ].join("\n") + "\n"
  );
}

function requestedFormat(argv: string[]): "text" | "json" {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format" && argv[index + 1] === "json") {
      return "json";
    }
    if (arg === "--format=json") {
      return "json";
    }
  }
  return "text";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await main();
  process.exit(code);
}
