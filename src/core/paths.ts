import type { CodeworkPaths } from "./types.ts";
import { resolveWorkspace } from "./workspace.ts";

export function resolveCodeworkPaths(options: {
  cwd: string;
  home?: string;
  workspace?: string;
  debug?: boolean;
}): CodeworkPaths {
  return resolveWorkspace(options);
}
