import crypto from "node:crypto";
import os from "node:os";
import process from "node:process";

export type AgentFingerprint = {
  source: string;
  value: string;
  hash: string;
};

export function detectAgentFingerprint(cwd: string): AgentFingerprint {
  const env = process.env;
  const candidates: Array<[string, string | undefined]> = [
    ["CODEWORK_AGENT_ID", env.CODEWORK_AGENT_ID],
    ["TMUX_PANE", env.TMUX_PANE],
    ["TERM_SESSION_ID", env.TERM_SESSION_ID],
    ["WT_SESSION", env.WT_SESSION],
    ["KITTY_WINDOW_ID", env.KITTY_WINDOW_ID],
    ["ALACRITTY_WINDOW_ID", env.ALACRITTY_WINDOW_ID],
    ["VSCODE_PID", env.VSCODE_PID],
    ["process.ppid", String(process.ppid || "")]
  ];

  for (const [source, value] of candidates) {
    if (value && value.trim() !== "") {
      return makeFingerprint(source, value);
    }
  }

  return makeFingerprint(
    "hostname+cwd+shell+ppid",
    `${safeHostname()}|${cwd}|${env.SHELL ?? ""}|${process.ppid || ""}`
  );
}

function makeFingerprint(source: string, value: string): AgentFingerprint {
  return {
    source,
    value,
    hash: crypto.createHash("sha256").update(`${source}:${value}`).digest("hex").slice(0, 16)
  };
}

function safeHostname(): string {
  try {
    return os.hostname();
  } catch {
    return process.env.HOSTNAME || "unknown";
  }
}
