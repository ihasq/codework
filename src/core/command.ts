export type PollCommandKind = "poll" | "wait";

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildCanonicalPollCommand(input: {
  kind: PollCommandKind;
  workspace: string;
  name: string;
  waitSeconds: number;
  intervalSeconds: number;
}): string {
  return [
    "codework",
    input.kind,
    `--workspace=${shellQuote(input.workspace)}`,
    `--name=${shellQuote(input.name)}`,
    `--wait=${formatSeconds(input.waitSeconds)}`,
    `--interval=${formatSeconds(input.intervalSeconds)}`
  ].join(" ");
}

export function formatSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
