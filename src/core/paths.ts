import { execFileSync } from "node:child_process";
import path from "node:path";

import type { CodeworkPaths } from "./types.ts";
import { slugifyIdentifier } from "./validate.ts";

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

export function resolveCodeworkPaths(options: {
  cwd: string;
  home?: string;
  workspace?: string;
  debug?: boolean;
}): CodeworkPaths {
  const cwd = path.resolve(options.cwd || process.cwd());
  const root = findRepositoryRoot(cwd, options.debug);
  const home = options.home ? path.resolve(cwd, options.home) : path.join(root, ".codework");

  if (!options.workspace) {
    return { cwd, root, home };
  }

  const workspace = slugifyIdentifier(options.workspace, "--workspace");
  const workspaceDir = path.join(home, "workspaces", workspace.slug);
  return {
    cwd,
    root,
    home,
    workspace: workspace.value,
    workspaceSlug: workspace.slug,
    workspaceDir
  };
}
