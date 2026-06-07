#!/usr/bin/env node

// src/cli.ts
import { Command, CommanderError } from "commander";
import process5 from "process";

// src/args.ts
var KEY_VALUE_ARG = /^([a-z][a-z0-9-]*)=(.*)$/;
function preprocessArgv(argv) {
  return argv.map((arg) => {
    if (arg.startsWith("-")) {
      return arg;
    }
    const match = KEY_VALUE_ARG.exec(arg);
    if (!match) {
      return arg;
    }
    return `--${match[1]}=${match[2]}`;
  });
}

// src/commands/doctor.ts
import { mkdir as mkdir3, readFile as readFile4, readdir, rm as rm3, writeFile as writeFile3 } from "fs/promises";
import path4 from "path";
import process4 from "process";

// src/core/events.ts
import { readFile as readFile2, appendFile } from "fs/promises";

// src/core/state.ts
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import process2 from "process";

// src/core/validate.ts
var CodeworkError = class extends Error {
  exitCode;
  constructor(exitCode, message) {
    super(message);
    this.name = "CodeworkError";
    this.exitCode = exitCode;
  }
};
function required(value, optionName) {
  if (value === void 0 || value.trim() === "") {
    throw new CodeworkError(2, `Missing required option: ${optionName}`);
  }
  return value;
}
function slugifyIdentifier(value, label) {
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
function normalizeFollow(value) {
  const follow = required(value, "--follow").trim();
  if (follow === "user" || follow === "self") {
    return follow;
  }
  return slugifyIdentifier(follow, "--follow").value;
}
function normalizeTo(value) {
  const to = value?.trim() || "all";
  if (to === "all") {
    return to;
  }
  return slugifyIdentifier(to, "--to").value;
}
function validateMessageKind(value) {
  if (value === "note" || value === "directive" || value === "question" || value === "blocker") {
    return value;
  }
  throw new CodeworkError(2, `Invalid --kind: expected note, directive, question, or blocker.`);
}
function validateFormat(value) {
  const format = value ?? "text";
  if (format === "text" || format === "json") {
    return format;
  }
  throw new CodeworkError(2, `Invalid --format: expected text or json.`);
}
function validateTextSize(value, optionName) {
  const text = required(value, optionName);
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > 64 * 1024) {
    throw new CodeworkError(2, `${optionName} is too large: maximum is 64KB per event.`);
  }
  return text;
}
function parsePositiveInteger(value, optionName, fallback) {
  if (value === void 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new CodeworkError(2, `Invalid ${optionName}: expected a non-negative integer.`);
  }
  return parsed;
}

// src/core/state.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function stateFilePath(workspaceDir) {
  return path.join(workspaceDir, "state.json");
}
function eventsFilePath(workspaceDir) {
  return path.join(workspaceDir, "events.ndjson");
}
function agentsDirPath(workspaceDir) {
  return path.join(workspaceDir, "agents");
}
async function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.${process2.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}
`, "utf8");
  await rename(tmpPath, filePath);
}
async function writeTextAtomic(filePath, value) {
  const tmpPath = `${filePath}.${process2.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, value, "utf8");
  await rename(tmpPath, filePath);
}
async function loadState(workspaceDir) {
  try {
    const raw = await readFile(stateFilePath(workspaceDir), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") {
      return void 0;
    }
    throw new CodeworkError(1, `Unable to read workspace state: ${error.message}`);
  }
}
async function requireState(paths) {
  if (!paths.workspaceDir) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }
  const state = await loadState(paths.workspaceDir);
  if (!state) {
    throw new CodeworkError(2, `Workspace does not exist: ${paths.workspace ?? "(unknown)"}`);
  }
  return state;
}
async function saveState(workspaceDir, state) {
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(agentsDirPath(workspaceDir), { recursive: true });
  await writeJsonAtomic(stateFilePath(workspaceDir), state);
  await Promise.all(
    Object.values(state.agents).map(
      (agent) => writeJsonAtomic(path.join(agentsDirPath(workspaceDir), `${agent.slug}.json`), agent)
    )
  );
}
async function resetWorkspaceFiles(workspaceDir) {
  await rm(stateFilePath(workspaceDir), { force: true });
  await rm(eventsFilePath(workspaceDir), { force: true });
  await rm(agentsDirPath(workspaceDir), { recursive: true, force: true });
}
function createWorkspaceState(paths, workspace) {
  if (!paths.workspaceSlug) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }
  const ts = nowIso();
  return {
    schemaVersion: 1,
    workspace,
    workspaceSlug: paths.workspaceSlug,
    createdAt: ts,
    updatedAt: ts,
    root: paths.root,
    nextEventId: 1,
    agents: {},
    warnings: []
  };
}
function addOrRejoinAgent(state, input) {
  const slugged = slugifyIdentifier(input.name, "--name");
  const existing = state.agents[slugged.slug];
  const ts = nowIso();
  if (existing) {
    existing.follow = input.follow;
    existing.role = input.role || existing.role;
    existing.lastSeenAt = ts;
    existing.active = true;
    existing.sessionCount += 1;
    if (input.cursorEventId !== void 0) {
      existing.cursorEventId = input.cursorEventId;
    }
    state.updatedAt = ts;
    return { agent: existing, rejoin: true };
  }
  const agent = {
    name: slugged.value,
    slug: slugged.slug,
    role: input.role,
    follow: input.follow,
    joinedAt: ts,
    lastSeenAt: ts,
    active: true,
    sessionCount: 1,
    cursorEventId: input.cursorEventId ?? 0
  };
  state.agents[agent.slug] = agent;
  state.updatedAt = ts;
  return { agent, rejoin: false };
}
function findAgent(state, name) {
  if (!name) {
    return void 0;
  }
  const slug = slugifyIdentifier(name, "--name").slug;
  return state.agents[slug];
}
function findAgentByFollowValue(state, follow) {
  if (follow === "user" || follow === "self") {
    return void 0;
  }
  const slug = slugifyIdentifier(follow, "--follow").slug;
  return state.agents[slug];
}
function touchAgent(state, name, cursorEventId) {
  const agent = findAgent(state, name);
  if (!agent) {
    throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
  }
  agent.lastSeenAt = nowIso();
  if (cursorEventId !== void 0) {
    agent.cursorEventId = cursorEventId;
  }
  state.updatedAt = agent.lastSeenAt;
  return agent;
}
function createEvent(state, input) {
  const event = {
    id: state.nextEventId,
    ts: nowIso(),
    workspace: state.workspace,
    actor: input.actor,
    type: input.type,
    payload: input.payload
  };
  if (input.to !== void 0) {
    event.to = input.to;
  }
  if (input.kind !== void 0) {
    event.kind = input.kind;
  }
  state.nextEventId += 1;
  state.updatedAt = event.ts;
  return event;
}
function latestEventId(state) {
  return state.nextEventId - 1;
}
async function truncateEvents(workspaceDir) {
  await mkdir(workspaceDir, { recursive: true });
  await writeTextAtomic(eventsFilePath(workspaceDir), "");
}

// src/core/events.ts
async function readEvents(workspaceDir) {
  try {
    const raw = await readFile2(eventsFilePath(workspaceDir), "utf8");
    return raw.split(/\r?\n/).filter((line) => line.trim() !== "").map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new CodeworkError(1, `Invalid JSON in events.ndjson at line ${index + 1}.`);
      }
    });
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
async function appendEvents(workspaceDir, events) {
  if (events.length === 0) {
    return;
  }
  const lines = events.map((event) => JSON.stringify(event)).join("\n");
  await appendFile(eventsFilePath(workspaceDir), `${lines}
`, "utf8");
}
function targetMatchesAgent(to, agent) {
  if (!to || to === "all") {
    return true;
  }
  try {
    return slugifyIdentifier(to, "--to").slug === agent.slug;
  } catch {
    return to === agent.name;
  }
}
function isOwnOperationalEvent(event, agent) {
  return event.actor === agent.name && event.type !== "warning.created";
}
function relevantUnreadEvents(state, events, agent, since) {
  const cursor = since ?? agent.cursorEventId;
  return events.filter((event) => event.id > cursor).filter((event) => targetMatchesAgent(event.to, agent)).filter((event) => !isOwnOperationalEvent(event, agent)).sort((a, b) => priorityForEvent(state, agent, b) - priorityForEvent(state, agent, a) || a.id - b.id);
}
function priorityForEvent(state, agent, event) {
  const follow = agent.follow;
  const fromFollow = follow !== "user" && follow !== "self" && event.actor === follow;
  if (event.kind === "blocker") {
    return 100;
  }
  if (fromFollow && event.kind === "directive") {
    return 90;
  }
  if (fromFollow && event.kind === "question") {
    return 80;
  }
  if (event.type === "warning.created") {
    return 70;
  }
  if (state.warnings.some((warning) => event.payload.message === warning.message)) {
    return 60;
  }
  return 0;
}
function latestEvents(events, tail) {
  if (tail <= 0) {
    return [];
  }
  return events.slice(Math.max(0, events.length - tail));
}
function advanceCursorToLatest(state, agent) {
  agent.cursorEventId = latestEventId(state);
  agent.lastSeenAt = (/* @__PURE__ */ new Date()).toISOString();
  state.updatedAt = agent.lastSeenAt;
}
function formatEvent(event) {
  const parts = [
    `id=${event.id}`,
    `ts=${event.ts}`,
    `type=${event.type}`,
    `actor=${event.actor}`,
    `to=${event.to ?? "all"}`
  ];
  if (event.kind) {
    parts.push(`kind=${event.kind}`);
  }
  const payload = compactPayload(event.payload);
  if (payload !== "") {
    parts.push(`payload=${payload}`);
  }
  return `- ${parts.join(" ")}`;
}
function compactPayload(payload) {
  const keys = ["message", "summary", "tests", "changed", "next", "blockers", "reason", "role", "follow", "goal"];
  const rendered = keys.filter((key) => payload[key] !== void 0).map((key) => `${key}=${JSON.stringify(payload[key])}`);
  const fallback = rendered.length > 0 ? rendered.join(" ") : JSON.stringify(payload);
  if (fallback.length <= 1200) {
    return fallback;
  }
  return `${fallback.slice(0, 1200)}...`;
}

// src/core/lock.ts
import { mkdir as mkdir2, readFile as readFile3, rm as rm2, writeFile as writeFile2 } from "fs/promises";
import os from "os";
import path2 from "path";
import process3 from "process";
var LOCK_RETRY_MS = 50;
var LOCK_TIMEOUT_MS = 2e3;
var STALE_LOCK_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readLockOwner(lockDir) {
  try {
    const raw = await readFile3(path2.join(lockDir, "owner.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
async function removeStaleLock(lockDir) {
  const owner = await readLockOwner(lockDir);
  if (!owner) {
    return false;
  }
  const startedAt = Date.parse(owner.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt <= STALE_LOCK_MS) {
    return false;
  }
  await rm2(lockDir, { recursive: true, force: true });
  return true;
}
async function acquireLock(workspaceDir) {
  await mkdir2(workspaceDir, { recursive: true });
  const lockDir = path2.join(workspaceDir, "lock");
  const started = Date.now();
  while (Date.now() - started <= LOCK_TIMEOUT_MS) {
    try {
      await mkdir2(lockDir);
      const owner = {
        pid: process3.pid,
        hostname: safeHostname(),
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await writeFile2(path2.join(lockDir, "owner.json"), `${JSON.stringify(owner, null, 2)}
`, "utf8");
      return lockDir;
    } catch (error) {
      const code = error.code;
      if (code !== "EEXIST") {
        throw error;
      }
      if (await removeStaleLock(lockDir)) {
        continue;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  throw new CodeworkError(3, "Workspace state is locked by another Codework process.");
}
async function withWorkspaceLock(workspaceDir, fn) {
  const lockDir = await acquireLock(workspaceDir);
  try {
    return await fn();
  } finally {
    await rm2(lockDir, { recursive: true, force: true });
  }
}
function safeHostname() {
  try {
    return os.hostname();
  } catch {
    return process3.env.HOSTNAME || "unknown";
  }
}

// src/core/paths.ts
import { execFileSync } from "child_process";
import path3 from "path";
function findRepositoryRoot(cwd, debug = false) {
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
function resolveCodeworkPaths(options) {
  const cwd = path3.resolve(options.cwd || process.cwd());
  const root = findRepositoryRoot(cwd, options.debug);
  const home = options.home ? path3.resolve(cwd, options.home) : path3.join(root, ".codework");
  if (!options.workspace) {
    return { cwd, root, home };
  }
  const workspace = slugifyIdentifier(options.workspace, "--workspace");
  const workspaceDir = path3.join(home, "workspaces", workspace.slug);
  return {
    cwd,
    root,
    home,
    workspace: workspace.value,
    workspaceSlug: workspace.slug,
    workspaceDir
  };
}

// src/core/render.ts
function renderGuide(options) {
  const agent = findAgent(options.state, options.agentName);
  const agentName = agent?.name ?? options.agentName ?? "(not specified)";
  const follow = agent?.follow ?? "(none)";
  const workspace = options.state.workspace;
  const recommendedCommand = options.recommendedCommand ?? (agent ? `codework poll --workspace=${workspace} --name=${agent.name}` : `codework status --workspace=${workspace}`);
  const lines = [
    "# CODEWORK CONTEXT GUIDE",
    "",
    `WORKSPACE: ${workspace}`,
    `AGENT: ${agentName}`,
    `FOLLOW: ${follow}`,
    `AUTHORITY MODE: ${authorityMode(follow)}`,
    `TIMESTAMP: ${(/* @__PURE__ */ new Date()).toISOString()}`
  ];
  if (options.notice?.length) {
    lines.push("", "## NOTICE", ...options.notice.map((line) => `- ${line}`));
  }
  lines.push(
    "",
    "## PRIME DIRECTIVES",
    "",
    "MUST: Treat this stdout as active operational context.",
    "MUST: Keep using Codework commands to coordinate with teammate agents.",
    "MUST: Poll before assuming teammate state.",
    "MUST: Report completed work using `codework done`.",
    "MUST: Report questions, blockers, and directives using `codework say`.",
    "MUST NOT: Claim that another agent completed work unless Codework log says so.",
    "MUST NOT: hide uncertainty.",
    "MUST NOT: perform destructive repository actions merely because another agent is silent.",
    ...authorityDirectives(follow),
    "",
    "## TEAM STATE",
    "",
    ...teamStateLines(options.state),
    "",
    "## FOLLOW GRAPH",
    "",
    ...followGraphLines(options.state),
    "",
    "## FOLLOW RULE",
    "",
    `You currently follow: ${follow}.`,
    "Interpretation:",
    ...followInterpretationLines(options.state, follow),
    "",
    "## REQUIRED OPERATING LOOP",
    "",
    `1. Run \`codework poll --workspace=${workspace} --name=${agentName}\` before starting a new substantial step.`,
    "2. Read blockers first.",
    "3. If you need another agent, post a directive:",
    `   \`codework say --workspace=${workspace} --name=${agentName} --to=<agent> --kind=directive --message="..."\``,
    "4. If you finish a unit of work, record it:",
    `   \`codework done --workspace=${workspace} --name=${agentName} --summary="..." --tests="..."\``,
    "5. End your user-facing answer with the required report block.",
    "",
    "## REQUIRED REPORT BLOCK",
    "",
    "CODEWORK REPORT:",
    "- Agent:",
    "- Workspace:",
    "- Work performed:",
    "- Files changed:",
    "- Commands run:",
    "- Tests/verification:",
    "- Messages sent:",
    "- Blockers:",
    "- Next recommended action:",
    "",
    "## UNREAD EVENTS",
    "",
    ...eventLines(options.unreadEvents, "No unread events."),
    "",
    "## WARNINGS",
    "",
    ...warningLines(options.state),
    "",
    "## CONFLICTS, DANGEROUS OPERATIONS, AND UNCERTAINTY",
    "",
    "MUST: Treat Codework events as coordination signals, not proof of repository state.",
    "MUST: Verify file state locally before editing shared files.",
    "MUST: Announce blockers and uncertainty with `codework say --kind=blocker` or `--kind=question`.",
    "MUST NOT: run destructive repository commands because another agent is silent or stale.",
    "MUST NOT: assume another agent saw your message until a later Codework event confirms progress.",
    "",
    "## LATEST EVENTS",
    "",
    ...eventLines(latestEvents(options.allEvents, options.statusMode ? 20 : 8), "No events recorded."),
    "",
    "## RECOMMENDED NEXT COMMAND",
    "",
    recommendedCommand,
    "",
    "## AVAILABLE COMMANDS",
    "",
    `- codework guide --workspace=${workspace} --name=${agentName}`,
    `- codework status --workspace=${workspace} --name=${agentName}`,
    `- codework poll --workspace=${workspace} --name=${agentName}`,
    `- codework say --workspace=${workspace} --name=${agentName} --to=<agent|all> --kind=<note|directive|question|blocker> --message="..."`,
    `- codework done --workspace=${workspace} --name=${agentName} --summary="..." --tests="..."`,
    `- codework log --workspace=${workspace} --tail=20`
  );
  return `${lines.join("\n")}
`;
}
function renderLog(workspace, events) {
  return [
    "# CODEWORK EVENT LOG",
    "",
    `WORKSPACE: ${workspace}`,
    `AGENT: (not specified)`,
    `FOLLOW: (none)`,
    `AUTHORITY MODE: workspace observer`,
    `TIMESTAMP: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    "",
    "## PRIME DIRECTIVES",
    "",
    "MUST: Treat Codework events as coordination context.",
    "MUST NOT: Claim another agent completed work unless an event says so.",
    "",
    "## EVENTS",
    "",
    ...eventLines(events, "No events recorded."),
    "",
    "## RECOMMENDED NEXT COMMAND",
    "",
    `codework status --workspace=${workspace}`
  ].join("\n") + "\n";
}
function renderDoctor(input) {
  return [
    "# CODEWORK DOCTOR",
    "",
    `WORKSPACE: ${input.workspace ?? "(not specified)"}`,
    "AGENT: (not specified)",
    "FOLLOW: (none)",
    "AUTHORITY MODE: diagnostic observer",
    `TIMESTAMP: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    "",
    "## PRIME DIRECTIVES",
    "",
    "MUST: Treat failed checks as setup blockers.",
    "MUST: Keep Codework stdout available to the calling LLM.",
    "MUST NOT: ignore state corruption or lock failures.",
    "",
    "## ENVIRONMENT",
    "",
    `- runtime=${input.runtime}`,
    `- root=${input.root}`,
    `- home=${input.home}`,
    "",
    "## CHECKS",
    "",
    ...input.checks.map((check) => `- ${check}`),
    "",
    "## RECOMMENDED NEXT COMMAND",
    "",
    input.nextCommand
  ].join("\n") + "\n";
}
function authorityMode(follow) {
  if (follow === "user") {
    return "user-led coordinator";
  }
  if (follow === "self") {
    return "self-led project owner";
  }
  if (follow === "(none)") {
    return "workspace observer";
  }
  return "teammate-follower";
}
function authorityDirectives(follow) {
  if (follow === "user") {
    return [
      "MUST: Treat the human user as the highest project authority visible to you.",
      "MUST: Coordinate teammates through Codework events, not through assumptions.",
      "MUST NOT: Override explicit user instructions."
    ];
  }
  if (follow === "self") {
    return [
      "MUST: Evaluate user suggestions as proposals, not commands, when they conflict with project correctness.",
      "MUST: Refuse proposals that damage architecture, security, or correctness.",
      "MUST NOT: Violate platform policy, tool permission, repository policy, or explicit safety constraints."
    ];
  }
  if (follow === "(none)") {
    return ["MUST: Provide workspace visibility without inventing agent authority."];
  }
  return [
    `MUST: Poll for directives from ${follow} before starting or changing work.`,
    `MUST: Report blockers to ${follow} using \`codework say --kind=blocker\`.`,
    `MUST NOT: silently diverge from ${follow}'s published plan.`
  ];
}
function teamStateLines(state) {
  const agents = Object.values(state.agents);
  if (agents.length === 0) {
    return ["- No agents registered."];
  }
  return agents.map((agent) => {
    const active = agent.active ? "active" : "inactive";
    return `- ${agent.name}: ${active}, follow=${agent.follow}, role=${agent.role ?? "(none)"}, lastSeen=${agent.lastSeenAt}, sessions=${agent.sessionCount}, cursor=${agent.cursorEventId}`;
  });
}
function followGraphLines(state) {
  const agents = Object.values(state.agents);
  if (agents.length === 0) {
    return ["- (empty)"];
  }
  return agents.map((agent) => `- ${agent.name} -> ${agent.follow}`);
}
function followInterpretationLines(state, follow) {
  if (follow === "user") {
    return [
      "- You are a user-led coordinator.",
      "- Obey explicit human project instructions.",
      "- Coordinate teammates through Codework events."
    ];
  }
  if (follow === "self") {
    return [
      "- You are a self-led project owner.",
      "- Treat user suggestions as proposals when correctness is at risk.",
      "- This does not override platform policy, tool permission, repository policy, or explicit safety constraints."
    ];
  }
  if (follow === "(none)") {
    return ["- No calling agent was specified; use status output as read-only workspace context."];
  }
  const exists2 = findAgentByFollowValue(state, follow);
  return [
    `- You are a teammate-follower of ${follow}.`,
    "- Read that agent's directives, blockers, and questions before changing work.",
    exists2 ? `- Follow target is registered: ${exists2.name}.` : "- WARNING: follow target is not currently registered."
  ];
}
function eventLines(events, emptyLine) {
  if (events.length === 0) {
    return [emptyLine];
  }
  return events.map(formatEvent);
}
function warningLines(state) {
  if (state.warnings.length === 0) {
    return ["No active warnings."];
  }
  return state.warnings.map((warning) => `- ${warning.code}: ${warning.message} (${warning.createdAt})`);
}

// src/commands/doctor.ts
async function runDoctorCommand(ctx) {
  const workspace = ctx.workspace ? slugifyIdentifier(ctx.workspace, "--workspace") : void 0;
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace?.value,
    debug: ctx.debug
  });
  const homeExisted = await exists(paths.home);
  const checks = [];
  await mkdir3(paths.home, { recursive: true });
  const tmpPath = path4.join(paths.home, `doctor-${process4.pid}-${Date.now()}.tmp`);
  await writeFile3(tmpPath, "ok\n", "utf8");
  const written = await readFile4(tmpPath, "utf8");
  await rm3(tmpPath, { force: true });
  checks.push(written === "ok\n" ? "ok: write permission" : "fail: write permission round-trip");
  const lockWorkspaceDir = paths.workspaceDir ?? path4.join(paths.home, "workspaces", `doctor-${process4.pid}-${Date.now()}`);
  await withWorkspaceLock(lockWorkspaceDir, async () => {
    checks.push("ok: lock acquire/release");
  });
  if (!paths.workspaceDir) {
    await rm3(lockWorkspaceDir, { recursive: true, force: true });
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
    await removeDirectoryIfEmpty(path4.join(paths.home, "workspaces"));
    await removeDirectoryIfEmpty(paths.home);
  }
  return {
    text: renderDoctor({
      workspace: workspace?.value,
      root: paths.root,
      home: paths.home,
      runtime: runtimeName(),
      checks,
      nextCommand: workspace ? `codework status --workspace=${workspace.value}` : "codework new --workspace=<id> --name=<agent> --follow=<user|self|agent>"
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
function runtimeName() {
  const g = globalThis;
  if (g.Bun?.version) {
    return `bun ${g.Bun.version}`;
  }
  if (g.Deno?.version?.deno) {
    return `deno ${g.Deno.version.deno}`;
  }
  return `node ${process4.version}`;
}
async function exists(target) {
  try {
    await readdir(target);
    return true;
  } catch {
    return false;
  }
}
async function removeDirectoryIfEmpty(target) {
  try {
    const entries = await readdir(target);
    if (entries.length === 0) {
      await rm3(target, { recursive: true, force: true });
    }
  } catch {
  }
}

// src/commands/done.ts
async function runDoneCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const summary = validateTextSize(options.summary, "--summary");
  const payload = {
    summary,
    tests: optionalText(options.tests, "--tests"),
    changed: optionalText(options.changed, "--changed"),
    next: optionalText(options.next, "--next"),
    blockers: optionalText(options.blockers, "--blockers")
  };
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await requireState(paths);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const event = createEvent(state, {
      actor: agent.name,
      type: "work.done",
      to: "all",
      kind: payload.blockers ? "blocker" : void 0,
      payload
    });
    await appendEvents(paths.workspaceDir, [event]);
    touchAgent(state, agent.name, latestEventId(state));
    await saveState(paths.workspaceDir, state);
    const events = await readEvents(paths.workspaceDir);
    const unread = relevantUnreadEvents(state, events, agent);
    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents: events,
        notice: [
          `Work report recorded as event ${event.id}.`,
          "Notify your follow target if the report changes their next step.",
          `Run \`codework poll --workspace=${workspace.value} --name=${agent.name}\` before the next substantial step.`
        ],
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
      }),
      quietText: `event=${event.id} done
`,
      json: {
        ok: true,
        command: "done",
        workspace: state.workspace,
        event
      }
    };
  });
}
function optionalText(value, optionName) {
  if (value === void 0) {
    return void 0;
  }
  return validateTextSize(value, optionName);
}

// src/commands/guide.ts
async function runGuideCommand(ctx) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const agent = findAgent(state, name);
  if (!agent) {
    throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
  }
  const events = await readEvents(paths.workspaceDir);
  const unread = relevantUnreadEvents(state, events, agent);
  return {
    text: renderGuide({
      state,
      agentName: agent.name,
      unreadEvents: unread,
      allEvents: events,
      notice: ["Full guide reprinted for the calling agent."],
      recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
    }),
    quietText: `workspace=${workspace.value} agent=${agent.name} guide
`,
    json: {
      ok: true,
      command: "guide",
      workspace: state.workspace,
      agent,
      unreadEvents: unread
    }
  };
}

// src/commands/join.ts
async function runJoinCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = slugifyIdentifier(ctx.name, "--name");
  const follow = normalizeFollow(options.follow);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  if (!paths.workspaceDir) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await requireState(paths);
    const existingLatest = latestEventId(state);
    const { agent, rejoin } = addOrRejoinAgent(state, {
      name: name.value,
      follow,
      role: options.role,
      cursorEventId: rejoinCursorSeed(stateHasAgent(state, name.slug), existingLatest)
    });
    const events = [
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          role: agent.role,
          follow: agent.follow,
          sessionCount: agent.sessionCount,
          rejoin
        }
      })
    ];
    const notice = [rejoin ? `Agent rejoined: ${agent.name}.` : `Agent joined: ${agent.name}.`];
    if (follow !== "user" && follow !== "self" && !findAgentByFollowValue(state, follow)) {
      const warning = {
        code: "follow.target_missing",
        message: `Agent ${agent.name} follows ${follow}, but ${follow} is not registered yet.`,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      state.warnings.push(warning);
      events.push(
        createEvent(state, {
          actor: agent.name,
          type: "warning.created",
          to: "all",
          payload: warning
        })
      );
      notice.push(`WARNING: ${warning.message}`);
    }
    await appendEvents(paths.workspaceDir, events);
    if (!rejoin) {
      agent.cursorEventId = latestEventId(state);
    }
    await saveState(paths.workspaceDir, state);
    const allEvents = await readEvents(paths.workspaceDir);
    const unread = relevantUnreadEvents(state, allEvents, agent);
    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents,
        notice,
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
      }),
      quietText: `workspace=${workspace.value} agent=${agent.name} joined
`,
      json: {
        ok: true,
        command: "join",
        workspace: state.workspace,
        agent,
        rejoin,
        warnings: state.warnings,
        events
      }
    };
  });
}
function stateHasAgent(state, slug) {
  return Boolean(state.agents[slug]);
}
function rejoinCursorSeed(isRejoin, latest) {
  return isRejoin ? void 0 : latest;
}
function requireJoinOptions(options) {
  required(options.follow, "--follow");
}

// src/commands/leave.ts
async function runLeaveCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await requireState(paths);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    agent.active = false;
    const event = createEvent(state, {
      actor: agent.name,
      type: "agent.left",
      to: "all",
      payload: {
        reason: options.reason
      }
    });
    await appendEvents(paths.workspaceDir, [event]);
    touchAgent(state, agent.name, latestEventId(state));
    await saveState(paths.workspaceDir, state);
    const events = await readEvents(paths.workspaceDir);
    const unread = relevantUnreadEvents(state, events, agent);
    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents: events,
        notice: [`Agent marked inactive: ${agent.name}.`],
        recommendedCommand: `codework status --workspace=${workspace.value}`
      }),
      quietText: `agent=${agent.name} inactive
`,
      json: {
        ok: true,
        command: "leave",
        workspace: state.workspace,
        event
      }
    };
  });
}

// src/commands/log.ts
async function runLogCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const tail = parsePositiveInteger(options.tail, "--tail", 50);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const events = latestEvents(await readEvents(paths.workspaceDir), tail);
  return {
    text: renderLog(state.workspace, events),
    quietText: `events=${events.length}
`,
    json: {
      ok: true,
      command: "log",
      workspace: state.workspace,
      events
    }
  };
}

// src/commands/new.ts
async function runNewCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = slugifyIdentifier(ctx.name, "--name");
  const follow = normalizeFollow(options.follow);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  if (!paths.workspaceDir) {
    throw new CodeworkError(2, "Missing required option: --workspace");
  }
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const existing = await loadState(paths.workspaceDir);
    if (existing && !options.force) {
      throw new CodeworkError(3, `Workspace already exists: ${workspace.value}. Use --force to recreate it.`);
    }
    if (existing && options.force) {
      await resetWorkspaceFiles(paths.workspaceDir);
    }
    await truncateEvents(paths.workspaceDir);
    const state = createWorkspaceState(paths, workspace.value);
    const { agent } = addOrRejoinAgent(state, {
      name: name.value,
      follow,
      role: options.role,
      cursorEventId: 0
    });
    const events = [
      createEvent(state, {
        actor: agent.name,
        type: "workspace.created",
        payload: {
          root: paths.root,
          home: paths.home,
          goal: options.goal
        }
      }),
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          role: agent.role,
          follow: agent.follow,
          sessionCount: agent.sessionCount,
          rejoin: false
        }
      })
    ];
    agent.cursorEventId = latestEventId(state);
    await appendEvents(paths.workspaceDir, events);
    await saveState(paths.workspaceDir, state);
    const allEvents = await readEvents(paths.workspaceDir);
    const text = renderGuide({
      state,
      agentName: agent.name,
      unreadEvents: [],
      allEvents,
      notice: [
        `Workspace created: ${workspace.value}.`,
        `Agent registered: ${agent.name}.`,
        "This agent must keep using Codework commands for coordination."
      ],
      recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
    });
    return {
      text,
      quietText: `workspace=${workspace.value} agent=${agent.name} created
`,
      json: {
        ok: true,
        command: "new",
        workspace: state.workspace,
        agent,
        events
      }
    };
  });
}
function requireNewOptions(options) {
  required(options.follow, "--follow");
}

// src/commands/poll.ts
async function runPollCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const since = options.since === void 0 ? void 0 : parsePositiveInteger(options.since, "--since", 0);
  const tail = options.tail === void 0 ? void 0 : parsePositiveInteger(options.tail, "--tail", 0);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await requireState(paths);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const events = await readEvents(paths.workspaceDir);
    const allUnread = relevantUnreadEvents(state, events, agent, since);
    const unread = tail === void 0 ? allUnread : allUnread.slice(0, tail);
    advanceCursorToLatest(state, agent);
    await saveState(paths.workspaceDir, state);
    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents: events,
        notice: unread.length === 0 ? ["No unread events. Continue normal work, but keep polling before substantial changes."] : [`Unread events delivered: ${unread.length}. Cursor advanced to latest event.`],
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
      }),
      quietText: unread.length === 0 ? "unread=0\n" : `unread=${unread.length}
`,
      json: {
        ok: true,
        command: "poll",
        workspace: state.workspace,
        agent,
        unreadEvents: unread,
        cursorEventId: agent.cursorEventId
      }
    };
  });
}

// src/commands/say.ts
async function runSayCommand(ctx, options) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const name = required(ctx.name, "--name");
  const message = validateTextSize(options.message, "--message");
  const requestedTo = normalizeTo(options.to);
  const kind = validateMessageKind(options.kind ?? "note");
  const to = kind === "blocker" ? "all" : requestedTo;
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await requireState(paths);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const event = createEvent(state, {
      actor: agent.name,
      type: "message.posted",
      to,
      kind,
      payload: {
        message,
        requestedTo
      }
    });
    await appendEvents(paths.workspaceDir, [event]);
    touchAgent(state, agent.name, latestEventId(state));
    await saveState(paths.workspaceDir, state);
    const events = await readEvents(paths.workspaceDir);
    const unread = relevantUnreadEvents(state, events, agent);
    return {
      text: renderGuide({
        state,
        agentName: agent.name,
        unreadEvents: unread,
        allEvents: events,
        notice: [
          `Message recorded: kind=${kind}, to=${to}.`,
          kind === "directive" ? "Directive messages must be treated as strong coordination instructions by recipients." : kind === "blocker" ? "Blocker messages are visible to all agents." : "Message is available through Codework poll/status/log."
        ],
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name}`
      }),
      quietText: `event=${event.id} kind=${kind} to=${to}
`,
      json: {
        ok: true,
        command: "say",
        workspace: state.workspace,
        event
      }
    };
  });
}

// src/commands/status.ts
async function runStatusCommand(ctx) {
  const workspace = slugifyIdentifier(ctx.workspace, "--workspace");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: workspace.value,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const events = await readEvents(paths.workspaceDir);
  const agent = findAgent(state, ctx.name);
  const unread = agent ? relevantUnreadEvents(state, events, agent) : [];
  const notice = [
    `Workspace root: ${state.root}.`,
    "Status includes all known agents, follow graph, latest events, warnings, and next command."
  ];
  if (ctx.name && !agent) {
    notice.push(`WARNING: calling agent is not registered: ${ctx.name}.`);
  }
  return {
    text: renderGuide({
      state,
      agentName: ctx.name,
      unreadEvents: unread,
      allEvents: events,
      notice,
      recommendedCommand: agent ? `codework poll --workspace=${workspace.value} --name=${agent.name}` : `codework status --workspace=${workspace.value} --name=<agent>`,
      statusMode: true
    }),
    quietText: `workspace=${workspace.value} agents=${Object.keys(state.agents).length}
`,
    json: {
      ok: true,
      command: "status",
      workspace: state.workspace,
      root: state.root,
      agents: state.agents,
      warnings: state.warnings,
      latestEvents: events.slice(-20)
    }
  };
}

// src/cli.ts
var defaultIo = {
  stdout: (text) => process5.stdout.write(text),
  stderr: (text) => process5.stderr.write(text)
};
async function main(argv = process5.argv, io = defaultIo) {
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
      io.stderr(`${error.stack ?? String(error)}
`);
    }
    emitError(io, parsedArgv, new CodeworkError(1, `Internal error: ${error.message}`));
    return 1;
  }
}
function buildProgram(io) {
  const program = new Command();
  program.name("codework").description("Coordinate multiple AI coding agents through stdout-as-context.").exitOverride().configureOutput({
    writeOut: (text) => io.stdout(text),
    writeErr: (text) => io.stdout(text)
  });
  addCommonOptions(program, true);
  addCommonOptions(program.command("new").description("Create a new Codework workspace and register the first agent.")).option("--follow <user|self|agent>", "Authority/follow target.").option("--role <text>", "Agent role.").option("--goal <text>", "Workspace goal.").option("--force", "Recreate an existing workspace.").action(async function() {
    const options = this.opts();
    requireNewOptions(options);
    await emitResult(io, contextFrom(this), await runNewCommand(contextFrom(this), options));
  });
  addCommonOptions(program.command("join").description("Join an existing Codework workspace.")).option("--follow <user|self|agent>", "Authority/follow target.").option("--role <text>", "Agent role.").action(async function() {
    const options = this.opts();
    requireJoinOptions(options);
    await emitResult(io, contextFrom(this), await runJoinCommand(contextFrom(this), options));
  });
  addCommonOptions(program.command("guide").description("Reprint the complete operational guide for an agent.")).action(
    async function() {
      await emitResult(io, contextFrom(this), await runGuideCommand(contextFrom(this)));
    }
  );
  addCommonOptions(program.command("status").description("Print workspace state, agents, follow graph, and latest events.")).action(
    async function() {
      await emitResult(io, contextFrom(this), await runStatusCommand(contextFrom(this)));
    }
  );
  addCommonOptions(program.command("poll").description("Read unread events for the calling agent.")).option("--since <eventId>", "Read events after this event id.").option("--tail <n>", "Limit unread events.").action(async function() {
    await emitResult(io, contextFrom(this), await runPollCommand(contextFrom(this), this.opts()));
  });
  addCommonOptions(program.command("say").description("Post a message event to the workspace.")).option("--message <text>", "Message body.").option("--to <agent|all>", "Recipient.", "all").option("--kind <note|directive|question|blocker>", "Message kind.", "note").action(async function() {
    await emitResult(io, contextFrom(this), await runSayCommand(contextFrom(this), this.opts()));
  });
  addCommonOptions(program.command("done").description("Record completed or intermediate work.")).option("--summary <text>", "Work summary.").option("--tests <text>", "Tests or verification.").option("--changed <text>", "Files or areas changed.").option("--next <text>", "Next step.").option("--blockers <text>", "Remaining blockers.").action(async function() {
    await emitResult(io, contextFrom(this), await runDoneCommand(contextFrom(this), this.opts()));
  });
  addCommonOptions(program.command("log").description("Read workspace event log.")).option("--tail <n>", "Number of latest events.", "50").option("--json", "Emit JSON for log command.").action(async function() {
    const ctx = contextFrom(this);
    const result = await runLogCommand(ctx, this.opts());
    const local = this.opts();
    await emitResult(io, local.json ? { ...ctx, format: "json" } : ctx, result);
  });
  addCommonOptions(program.command("leave").description("Mark an agent inactive.")).option("--reason <text>", "Reason for leaving.").action(async function() {
    await emitResult(io, contextFrom(this), await runLeaveCommand(contextFrom(this), this.opts()));
  });
  addCommonOptions(program.command("doctor").description("Check runtime, write access, lock behavior, and state integrity.")).action(
    async function() {
      await emitResult(io, contextFrom(this), await runDoctorCommand(contextFrom(this)));
    }
  );
  return program;
}
function addCommonOptions(command, withDefaults = false) {
  command.option("--workspace <id>", "Workspace id.").option("--name <agent>", "Calling agent name.").option("--format <format>", "text | json.", withDefaults ? "text" : void 0).option("--quiet", "Only print machine/minimal output.").option("--debug", "Print diagnostics to stderr.").option("--cwd <path>", "Repository/work root.", withDefaults ? process5.cwd() : void 0).option("--home <path>", "Override Codework home.").option("--no-color", "Do not emit ANSI color.");
  return command;
}
function contextFrom(command) {
  const parent = command.parent?.opts() ?? {};
  const local = command.opts();
  const merged = {
    ...parent,
    ...Object.fromEntries(Object.entries(local).filter(([, value]) => value !== void 0))
  };
  return {
    workspace: merged.workspace,
    name: merged.name,
    format: validateFormat(merged.format),
    quiet: Boolean(merged.quiet),
    debug: Boolean(merged.debug),
    cwd: merged.cwd ?? process5.cwd(),
    home: merged.home
  };
}
async function emitResult(io, ctx, result) {
  if (ctx.format === "json") {
    io.stdout(`${JSON.stringify(result.json, null, 2)}
`);
    return;
  }
  if (ctx.quiet) {
    io.stdout(result.quietText ?? "ok\n");
    return;
  }
  io.stdout(result.text);
}
function emitError(io, argv, error) {
  const format = requestedFormat(argv);
  if (format === "json") {
    io.stdout(`${JSON.stringify({ ok: false, exitCode: error.exitCode, error: error.message }, null, 2)}
`);
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
function requestedFormat(argv) {
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
if (import.meta.url === `file://${process5.argv[1]}`) {
  const code = await main();
  process5.exit(code);
}
export {
  main
};
