import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { readEvents } from "../core/events.ts";
import { withWorkspaceLock } from "../core/lock.ts";
import { resolveCodeworkPaths } from "../core/paths.ts";
import { renderDoctor } from "../core/render.ts";
import { loadState } from "../core/state.ts";
import type { CommandContext, CommandResult } from "../core/types.ts";
import { slugifyIdentifier } from "../core/validate.ts";

type RuntimeGlobal = typeof globalThis & {
  Deno?: { version?: { deno?: string } };
  Bun?: { version?: string };
};

export async function runDoctorCommand(ctx: CommandContext): Promise<CommandResult> {
  const workspace = ctx.workspace ? slugifyIdentifier(ctx.workspace, "--workspace") : undefined;
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace?.value,
    debug: ctx.debug
  });
  const homeExisted = await exists(paths.home);
  const checks: string[] = [];

  await mkdir(paths.home, { recursive: true });
  const tmpPath = path.join(paths.home, `doctor-${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmpPath, "ok\n", "utf8");
  const written = await readFile(tmpPath, "utf8");
  await rm(tmpPath, { force: true });
  checks.push(written === "ok\n" ? "ok: write permission" : "fail: write permission round-trip");

  const lockWorkspaceDir =
    paths.workspaceDir ?? path.join(paths.home, "workspaces", `doctor-${process.pid}-${Date.now()}`);
  await withWorkspaceLock(lockWorkspaceDir, async () => {
    checks.push("ok: lock acquire/release");
  });
  if (!paths.workspaceDir) {
    await rm(lockWorkspaceDir, { recursive: true, force: true });
  }

  if (paths.workspaceDir) {
    const state = await loadState(paths.workspaceDir);
    if (!state) {
      checks.push(`warn: workspace state not found for ${workspace?.value}`);
    } else {
      checks.push(`ok: state.json schemaVersion=${state.schemaVersion}`);
      const events = await readEvents(paths.workspaceDir);
      const sequential = events.every((event, index) => event.id === index + 1);
      checks.push(sequential ? `ok: events.ndjson sequential ids count=${events.length}` : "fail: events.ndjson ids are not sequential");
    }
  } else {
    checks.push("ok: workspace state check skipped");
  }

  if (!homeExisted) {
    await removeDirectoryIfEmpty(path.join(paths.home, "workspaces"));
    await removeDirectoryIfEmpty(paths.home);
  }

  return {
    text: renderDoctor({
      workspace: workspace?.value,
      root: paths.root,
      home: paths.home,
      runtime: runtimeName(),
      checks,
      nextCommand: workspace
        ? `codework status --workspace=${workspace.value}`
        : "codework new --workspace=<id> --name=<agent> --follow=<user|self|agent>"
    }),
    quietText: "doctor=ok\n",
    json: {
      ok: true,
      command: "doctor",
      runtime: runtimeName(),
      root: paths.root,
      home: paths.home,
      workspace: workspace?.value,
      checks
    }
  };
}

function runtimeName(): string {
  const g = globalThis as RuntimeGlobal;
  if (g.Bun?.version) {
    return `bun ${g.Bun.version}`;
  }
  if (g.Deno?.version?.deno) {
    return `deno ${g.Deno.version.deno}`;
  }
  return `node ${process.version}`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await readdir(target);
    return true;
  } catch {
    return false;
  }
}

async function removeDirectoryIfEmpty(target: string): Promise<void> {
  try {
    const entries = await readdir(target);
    if (entries.length === 0) {
      await rm(target, { recursive: true, force: true });
    }
  } catch {
    // Doctor must not fail while cleaning up an optional temporary directory.
  }
}
