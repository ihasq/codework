import type { ExitCode, MessageKind, OutputFormat } from "./types.ts";

export class CodeworkError extends Error {
  readonly exitCode: ExitCode;

  constructor(exitCode: ExitCode, message: string) {
    super(message);
    this.name = "CodeworkError";
    this.exitCode = exitCode;
  }
}

export type Slugged = {
  value: string;
  slug: string;
};

export function required(value: string | undefined, optionName: string): string {
  if (value === undefined || value.trim() === "") {
    throw new CodeworkError(2, `Missing required option: ${optionName}`);
  }
  return value;
}

export function slugifyIdentifier(value: string | undefined, label: string): Slugged {
  const raw = required(value, label).trim();
  if (raw === "." || raw === ".." || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    throw new CodeworkError(
      2,
      `Invalid ${label}: value must not be empty, '.', '..', contain '..', '/', or '\\'.`
    );
  }

  const slug = raw.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (slug === "" || slug === "." || slug === ".." || slug.includes("..")) {
    throw new CodeworkError(2, `Invalid ${label}: normalized slug is not safe.`);
  }

  return { value: raw, slug };
}

export function normalizeFollow(value: string | undefined): string {
  const follow = required(value, "--follow").trim();
  if (follow === "user" || follow === "self") {
    return follow;
  }
  return slugifyIdentifier(follow, "--follow").value;
}

export function normalizeTo(value: string | undefined): string {
  const to = value?.trim() || "all";
  if (to === "all") {
    return to;
  }
  return slugifyIdentifier(to, "--to").value;
}

export function validateMessageKind(value: string): MessageKind {
  if (value === "note" || value === "directive" || value === "question" || value === "blocker") {
    return value;
  }
  throw new CodeworkError(2, `Invalid --kind: expected note, directive, question, or blocker.`);
}

export function validateFormat(value: string | undefined): OutputFormat {
  const format = value ?? "text";
  if (format === "text" || format === "json") {
    return format;
  }
  throw new CodeworkError(2, `Invalid --format: expected text or json.`);
}

export function validateTextSize(value: string | undefined, optionName: string): string {
  const text = required(value, optionName);
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > 64 * 1024) {
    throw new CodeworkError(2, `${optionName} is too large: maximum is 64KB per event.`);
  }
  return text;
}

export function parsePositiveInteger(value: string | undefined, optionName: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new CodeworkError(2, `Invalid ${optionName}: expected a non-negative integer.`);
  }
  return parsed;
}

export function parseBoundedSeconds(input: {
  cliValue?: string;
  envValue?: string;
  optionName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const value = input.cliValue ?? input.envValue;
  if (value === undefined || value.trim() === "") {
    return input.fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < input.min || parsed > input.max) {
    throw new CodeworkError(
      2,
      `Invalid ${input.optionName}: expected seconds between ${input.min} and ${input.max}.`
    );
  }
  return parsed;
}
