import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CodeworkPaths } from "./types.ts";
import { slugifyIdentifier } from "./validate.ts";

export function resolveWorkspace(input: {
  cwd: string;
  home?: string;
  workspace?: string;
  debug?: boolean;
  createPathWorkspaceRoot?: boolean;
}): CodeworkPaths {
  const cwd = path.resolve(input.cwd || process.cwd());
  const workspaceArg = input.workspace?.trim();

  if (workspaceArg && looksLikePathWorkspace(workspaceArg)) {
    const workspaceRoot = canonicalizePath(expandHome(workspaceArg), input.createPathWorkspaceRoot ?? true);
    return directoryWorkspace(cwd, workspaceRoot, input.home);
  }

  if (workspaceArg) {
    const root = findRepositoryRoot(cwd, input.debug);
    const workspace = slugifyIdentifier(workspaceArg, "--workspace");
    const home = input.home ? path.resolve(cwd, input.home) : path.join(root, ".codework");
    return {
      cwd,
      root,
      home,
      workspace: workspace.value,
      workspaceSlug: workspace.slug,
      workspaceKind: "named",
      workspaceRoot: root,
      workspaceDir: path.join(home, "workspaces", workspace.slug)
    };
  }

  const root = findRepositoryRoot(cwd, input.debug);
  return directoryWorkspace(cwd, canonicalizePath(root, false), input.home);
}

export function looksLikePathWorkspace(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("~");
}

function directoryWorkspace(cwd: string, workspaceRoot: string, homeOverride?: string): CodeworkPaths {
  const displayName = path.basename(workspaceRoot) || "workspace";
  const hash = crypto.createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 8);
  const slugBase = displayName.replace(/[^a-zA-Z0-9._-]/g, "-") || "workspace";
  const workspaceSlug = `${slugBase}-${hash}`;
  const home = homeOverride ? path.resolve(cwd, homeOverride) : path.join(workspaceRoot, ".codework");
  return {
    cwd,
    root: workspaceRoot,
    home,
    workspace: displayName,
    workspaceSlug,
    workspaceKind: "directory",
    workspaceRoot,
    workspaceHash: hash,
    workspaceDir: path.join(home, "workspaces", workspaceSlug)
  };
}

function findRepositoryRoot(cwd: string, debug = false): string {
  try {
    const stdout = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", debug ? "inherit" : "ignore"]
    });
    const root = stdout.trim();
    return root === "" ? cwd : root;
  } catch {
    return cwd;
  }
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function canonicalizePath(value: string, create: boolean): string {
  const resolved = path.resolve(value);
  if (create) {
    mkdirSync(resolved, { recursive: true });
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}
