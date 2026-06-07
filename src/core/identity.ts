import type { CommandContext } from "./types.ts";
import { detectAgentFingerprint } from "./fingerprint.ts";
import { findAgent } from "./state.ts";
import type { WorkspaceState } from "./types.ts";
import { CodeworkError } from "./validate.ts";

export function findAgentByFingerprint(state: WorkspaceState, fingerprintHash: string) {
  return Object.values(state.agents).find((agent) => agent.fingerprintHash === fingerprintHash);
}

export function resolveAgentNameForCommand(state: WorkspaceState, ctx: CommandContext): string {
  if (ctx.name) {
    return ctx.name;
  }
  if (process.env.CODEWORK_AGENT_NAME && findAgent(state, process.env.CODEWORK_AGENT_NAME)) {
    return process.env.CODEWORK_AGENT_NAME;
  }

  const fingerprint = detectAgentFingerprint(ctx.cwd);
  const agent = findAgentByFingerprint(state, fingerprint.hash);
  if (agent) {
    return agent.name;
  }

  throw new CodeworkError(2, "Agent identity is required.", identityRequiredStdout());
}

export function identityRequiredStdout(): string {
  return [
    "# CODEWORK IDENTITY REQUIRED",
    "",
    "MUST: Run `codework` once in this terminal before using this command.",
    "MUST NOT: guess your agent identity.",
    "",
    "RUN COMMAND:",
    "codework"
  ].join("\n") + "\n";
}
