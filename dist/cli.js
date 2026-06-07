#!/usr/bin/env node

// src/cli.ts
import { Command, CommanderError } from "commander";
import { realpathSync as realpathSync2 } from "fs";
import process8 from "process";
import { fileURLToPath } from "url";

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

// src/core/migrate.ts
function migrateWorkspaceState(raw) {
  const state = raw;
  const agents = Object.values(state.agents ?? {});
  const sortedAgents = [...agents].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const leader = state.leaderAgent ?? sortedAgents.find((agent) => agent.follow === "user")?.name ?? sortedAgents[0]?.name;
  sortedAgents.forEach((agent, index) => {
    agent.joinOrder = agent.joinOrder ?? index + 1;
    agent.leadership = agent.leadership ?? (agent.name === leader ? "leader" : "follower");
  });
  return {
    ...state,
    schemaVersion: 2,
    workspaceKind: state.workspaceKind ?? "named",
    workspaceRoot: state.workspaceRoot ?? state.root,
    leaderAgent: leader,
    agents: state.agents,
    warnings: state.warnings ?? []
  };
}

// src/core/validate.ts
var CodeworkError = class extends Error {
  exitCode;
  stdout;
  constructor(exitCode, message, stdout) {
    super(message);
    this.name = "CodeworkError";
    this.exitCode = exitCode;
    this.stdout = stdout;
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
function parseBoundedSeconds(input) {
  const value = input.cliValue ?? input.envValue;
  if (value === void 0 || value.trim() === "") {
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
    return migrateWorkspaceState(JSON.parse(raw));
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
    schemaVersion: 2,
    workspace,
    workspaceSlug: paths.workspaceSlug,
    workspaceKind: paths.workspaceKind ?? "named",
    workspaceRoot: paths.workspaceRoot ?? paths.root,
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
    existing.fingerprintHash = input.fingerprintHash ?? existing.fingerprintHash;
    existing.fingerprintSource = input.fingerprintSource ?? existing.fingerprintSource;
    existing.autoNamed = input.autoNamed ?? existing.autoNamed;
    existing.leadership = input.leadership ?? existing.leadership;
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
    cursorEventId: input.cursorEventId ?? 0,
    fingerprintHash: input.fingerprintHash,
    fingerprintSource: input.fingerprintSource,
    autoNamed: input.autoNamed,
    joinOrder: nextJoinOrder(state),
    leadership: input.leadership ?? "follower"
  };
  state.agents[agent.slug] = agent;
  state.updatedAt = ts;
  return { agent, rejoin: false };
}
function nextJoinOrder(state) {
  return Math.max(0, ...Object.values(state.agents).map((agent) => agent.joinOrder ?? 0)) + 1;
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
  return events.filter((event) => event.id > cursor).filter((event) => targetMatchesAgent(event.to, agent) || event.actor === agent.follow).filter((event) => !isOwnOperationalEvent(event, agent)).sort((a, b) => priorityForEvent(state, agent, b) - priorityForEvent(state, agent, a) || a.id - b.id);
}
function isActionableEvent(event, agent) {
  if (event.type === "warning.created") {
    return true;
  }
  if (event.type === "message.posted") {
    return event.kind === "directive" || event.kind === "question" || event.kind === "blocker";
  }
  if (event.type === "work.done") {
    return agent.follow !== "user" && agent.follow !== "self" && event.actor === agent.follow;
  }
  return false;
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

// src/core/workspace.ts
import { execFileSync } from "child_process";
import crypto from "crypto";
import { mkdirSync, realpathSync } from "fs";
import os2 from "os";
import path3 from "path";
function resolveWorkspace(input) {
  const cwd = path3.resolve(input.cwd || process.cwd());
  const workspaceArg = input.workspace?.trim();
  if (workspaceArg && looksLikePathWorkspace(workspaceArg)) {
    const workspaceRoot = canonicalizePath(expandHome(workspaceArg), input.createPathWorkspaceRoot ?? true);
    return directoryWorkspace(cwd, workspaceRoot, input.home);
  }
  if (workspaceArg) {
    const root2 = findRepositoryRoot(cwd, input.debug);
    const workspace = slugifyIdentifier(workspaceArg, "--workspace");
    const home = input.home ? path3.resolve(cwd, input.home) : path3.join(root2, ".codework");
    return {
      cwd,
      root: root2,
      home,
      workspace: workspace.value,
      workspaceSlug: workspace.slug,
      workspaceKind: "named",
      workspaceRoot: root2,
      workspaceDir: path3.join(home, "workspaces", workspace.slug)
    };
  }
  const root = findRepositoryRoot(cwd, input.debug);
  return directoryWorkspace(cwd, canonicalizePath(root, false), input.home);
}
function looksLikePathWorkspace(value) {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("~");
}
function directoryWorkspace(cwd, workspaceRoot, homeOverride) {
  const displayName = path3.basename(workspaceRoot) || "workspace";
  const hash = crypto.createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 8);
  const slugBase = displayName.replace(/[^a-zA-Z0-9._-]/g, "-") || "workspace";
  const workspaceSlug = `${slugBase}-${hash}`;
  const home = homeOverride ? path3.resolve(cwd, homeOverride) : path3.join(workspaceRoot, ".codework");
  return {
    cwd,
    root: workspaceRoot,
    home,
    workspace: displayName,
    workspaceSlug,
    workspaceKind: "directory",
    workspaceRoot,
    workspaceHash: hash,
    workspaceDir: path3.join(home, "workspaces", workspaceSlug)
  };
}
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
function expandHome(value) {
  if (value === "~") {
    return os2.homedir();
  }
  if (value.startsWith("~/")) {
    return path3.join(os2.homedir(), value.slice(2));
  }
  return value;
}
function canonicalizePath(value, create) {
  const resolved = path3.resolve(value);
  if (create) {
    mkdirSync(resolved, { recursive: true });
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

// src/core/paths.ts
function resolveCodeworkPaths(options) {
  return resolveWorkspace(options);
}

// src/core/command.ts
function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function buildCanonicalPollCommand(input) {
  return [
    "codework",
    input.kind,
    `--workspace=${shellQuote(input.workspace)}`,
    `--name=${shellQuote(input.name)}`,
    `--wait=${formatSeconds(input.waitSeconds)}`,
    `--interval=${formatSeconds(input.intervalSeconds)}`
  ].join(" ");
}
function formatSeconds(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

// src/core/render.ts
function renderGuide(options) {
  const agent = findAgent(options.state, options.agentName);
  const agentName = agent?.name ?? options.agentName ?? "(not specified)";
  const follow = agent?.follow ?? "(none)";
  const workspace = options.state.workspace;
  const recommendedCommand = options.recommendedCommand ?? (agent ? defaultPollCommand(workspace, agent.name) : `codework status --workspace=${workspace}`);
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
    ...waitingForFollowTargetLines(options.state, agent, workspace),
    "",
    "## REQUIRED OPERATING LOOP",
    "",
    `1. Run \`${agent ? defaultPollCommand(workspace, agent.name) : `codework poll --workspace=${workspace} --name=${agentName} --wait=30 --interval=2`}\` before starting a new substantial step.`,
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
    ...eventLines(options.unreadEvents, "No actionable unread events are shown here. Use the poll command below to wait for peer events."),
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
    `- codework poll --workspace=${workspace} --name=${agentName} --wait=30 --interval=2`,
    `- codework wait --workspace=${workspace} --name=${agentName} --wait=30 --interval=2`,
    `- codework say --workspace=${workspace} --name=${agentName} --to=<agent|all> --kind=<note|directive|question|blocker> --message="..."`,
    `- codework done --workspace=${workspace} --name=${agentName} --summary="..." --tests="..."`,
    `- codework log --workspace=${workspace} --tail=20`
  );
  return `${lines.join("\n")}
`;
}
function renderPollResult(options) {
  const follow = options.agent.follow;
  const lines = [
    options.title,
    "",
    `WORKSPACE: ${options.state.workspace}`,
    `AGENT: ${options.agent.name}`,
    `FOLLOW: ${follow}`,
    `AUTHORITY MODE: ${authorityMode(follow)}`,
    `TIMESTAMP: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    `POLL WINDOW: ${formatPollSeconds(options.waitSeconds)}`,
    `POLL INTERVAL: ${formatPollSeconds(options.intervalSeconds)}`,
    `POLL RESULT: ${options.pollResult}`,
    `CONSECUTIVE EMPTY POLLS: ${options.agent.lastPollEmptyCount ?? 0}`,
    "",
    "## TEAM STATE",
    "",
    ...teamStateLines(options.state),
    "",
    "## FOLLOW RULE",
    "",
    `You currently follow: ${follow}.`,
    ...pollFollowRuleLines(follow)
  ];
  if (options.actionableEvents.length > 0) {
    lines.push(
      "",
      "## ACTIONABLE EVENTS",
      "",
      ...structuredEventLines(options.actionableEvents),
      "",
      "## REQUIRED NEXT ACTION",
      "",
      "MUST: Handle the actionable event above before polling again.",
      follow !== "user" && follow !== "self" ? `MUST: Follow directives from ${follow} because your follow target is ${follow}.` : "MUST: Apply the actionable event according to your authority mode and the human's current instruction.",
      `MUST: If blocked, send \`codework say --workspace=${options.state.workspace} --name=${options.agent.name} --to=${followTargetForCommand(follow)} --kind=blocker --message="..."\``,
      `MUST: If complete, send \`codework done --workspace=${options.state.workspace} --name=${options.agent.name} --summary="..." --tests="..."\``,
      "MUST NOT: ignore this directive and continue waiting.",
      "",
      "NEXT POLL COMMAND AFTER HANDLING:",
      options.nextPollCommand
    );
  } else {
    lines.push(
      "",
      "## NO ACTIONABLE EVENTS",
      "",
      "No actionable events arrived during this poll window."
    );
    if (options.nonActionableEvents.length > 0) {
      lines.push(
        "",
        "## OBSERVED NON-ACTIONABLE EVENTS",
        "",
        ...structuredEventLines(options.nonActionableEvents)
      );
    }
    lines.push(
      "",
      "## WAIT CONTINUATION REQUIRED",
      "",
      "STATE: waiting-for-peer-event",
      "MUST: Run the exact command below again.",
      "MUST: Continue repeating it until an actionable event appears, the human gives a new instruction, or you explicitly report that you are still waiting.",
      "MUST NOT: treat this empty poll as task completion.",
      "MUST NOT: invent teammate state.",
      "MUST NOT: start unrelated work merely because no event arrived.",
      "",
      "RE-RUN EXACT COMMAND:",
      options.canonicalCommand,
      "",
      "## REPORTING RULE",
      "",
      "If you decide to speak to the human while still waiting, use this exact report shape:",
      "",
      "CODEWORK WAITING REPORT:",
      `- Agent: ${options.agent.name}`,
      `- Workspace: ${options.state.workspace}`,
      `- Waiting for: ${waitingForText(follow)}`,
      `- Consecutive empty polls: ${options.agent.lastPollEmptyCount ?? 0}`,
      `- Last poll command: ${options.canonicalCommand}`,
      "- Next action: run the same poll command again"
    );
  }
  return `${lines.join("\n")}
`;
}
function renderAutoEnter(options) {
  const role = options.agent.leadership === "leader" ? "leader" : "follower engineer";
  const lines = [
    "# CODEWORK AUTO-ENTER",
    "",
    `WORKSPACE: ${options.state.workspace}`,
    `WORKSPACE MODE: ${options.state.workspaceKind === "directory" ? "directory-default" : "named"}`,
    `WORKSPACE ROOT: ${options.state.workspaceRoot}`,
    `AGENT: ${options.agent.name}`,
    `ROLE: ${role}`,
    `FOLLOW: ${options.agent.follow}`,
    `AUTHORITY MODE: ${authorityMode(options.agent.follow)}`,
    ...options.agent.leadership === "leader" ? ["DEFAULT APPLIED: follow=user"] : [],
    `TIMESTAMP: ${(/* @__PURE__ */ new Date()).toISOString()}`
  ];
  if (options.warning) {
    lines.push("", "## WARNING", "", `WARNING: ${options.warning}`);
  }
  if (options.agent.leadership === "leader") {
    lines.push(...autoEnterLeaderSections(options));
  } else {
    lines.push(...autoEnterFollowerSections(options));
  }
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
    const poll = agent.lastPollAt ? `, lastPoll=${agent.lastPollAt}, emptyPolls=${agent.lastPollEmptyCount ?? 0}` : "";
    return `- ${agent.name}: ${active}, follow=${agent.follow}, role=${agent.role ?? "(none)"}, lastSeen=${agent.lastSeenAt}, sessions=${agent.sessionCount}, cursor=${agent.cursorEventId}${poll}`;
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
function autoEnterLeaderSections(options) {
  if (options.mode === "new-leader") {
    return [
      "",
      "## WHY YOU ARE LEADER",
      "",
      "You are the first participant detected in this directory workspace.",
      "Codework registered you as the leader for this workspace.",
      "",
      "## SAFETY DEFAULT",
      "",
      "DEFAULT APPLIED: follow=user",
      "Reason: Human-led coordination is the safe default. Self-led project ownership must be explicit.",
      "",
      "MUST: Treat the human user as the highest visible project authority.",
      "MUST: Convert vague user requests into concrete implementation directives.",
      "MUST: Coordinate later agents through Codework events.",
      "MUST NOT: switch to self-led authority unless the human explicitly requests it.",
      "",
      "## NEXT STEPS",
      "",
      "MUST: Wait for the human user's project instruction if none has been given yet.",
      "MUST: When a follower appears, assign work with:",
      'codework say worker-2 "..."',
      "MUST: Check follower events by running:",
      "codework",
      "",
      "## SHORT COMMANDS",
      "",
      "- codework",
      "- codework status",
      '- codework say worker-2 "..."',
      '- codework done "..."'
    ];
  }
  if (options.actionableEvents.length > 0) {
    return [
      "",
      "## ACTIONABLE TEAM EVENTS",
      "",
      ...structuredEventLines(options.actionableEvents),
      "",
      "## LEADER NEXT ACTION",
      "",
      "MUST: Handle follower blocker, question, or completion report before assuming team state.",
      "MUST: If follower work is needed, send a directive with `codework say`.",
      "MUST NOT: assume follower completion from silence.",
      "",
      "NEXT CHECK COMMAND AFTER HANDLING:",
      "codework"
    ];
  }
  return [
    "",
    "## NO ACTIONABLE TEAM EVENTS",
    "",
    "No follower blocker, question, or completion report arrived during this poll window.",
    "",
    "## LEADER NEXT ACTION",
    "",
    "MUST: Continue following the human user's current instruction if one exists.",
    "MUST: If follower work is needed, send a directive with `codework say`.",
    "MUST: If you are waiting for follower completion, run `codework` again.",
    "MUST NOT: assume follower completion from silence.",
    "",
    "RE-RUN TO CHECK TEAM EVENTS:",
    "codework"
  ];
}
function autoEnterFollowerSections(options) {
  const leader = options.leader;
  const leaderName = leader?.name ?? options.agent.follow;
  const lines = [
    "",
    "## LEADER DETECTED",
    "",
    "You have an earlier participant in this workspace.",
    "That earlier participant is the leader for this directory workspace.",
    "You are joining as a follower engineer.",
    "",
    "Leader:",
    `- agent: ${leaderName}`,
    `- follow: ${leader?.follow ?? "user"}`,
    `- role: ${leader?.role ?? "leader"}`,
    "",
    "## FOLLOW RULE",
    "",
    `MUST: Follow directives from ${leaderName}.`,
    "MUST: Poll for instructions before starting implementation.",
    "MUST NOT: reinterpret the human request independently when a leader exists.",
    "MUST NOT: start implementation until an actionable event appears or the human directly gives you a new explicit instruction."
  ];
  if (options.actionableEvents.length > 0) {
    lines.push(
      "",
      "## ACTIONABLE EVENTS",
      "",
      ...structuredEventLines(options.actionableEvents),
      "",
      "## REQUIRED NEXT ACTION",
      "",
      "MUST: Handle the directive above now.",
      "MUST: Report completion with:",
      'codework done "..."',
      "MUST: If blocked, report with:",
      `codework say ${leaderName} --kind=blocker "..."`,
      "MUST NOT: continue polling before handling this directive.",
      "",
      "NEXT CHECK COMMAND AFTER HANDLING:",
      "codework"
    );
    return lines;
  }
  lines.push(
    "",
    "## POLL RESULT",
    "",
    "No actionable events arrived during this poll window."
  );
  if (options.nonActionableEvents.length > 0) {
    lines.push("", "## OBSERVED NON-ACTIONABLE EVENTS", "", ...structuredEventLines(options.nonActionableEvents));
  }
  lines.push(
    "",
    "## WAIT CONTINUATION REQUIRED",
    "",
    "MUST: Run the exact command below again.",
    "MUST: Continue repeating it until an actionable event appears, the human gives a new instruction, or you explicitly report that you are still waiting.",
    "MUST NOT: treat this empty poll as task completion.",
    "MUST NOT: invent leader state.",
    "MUST NOT: start unrelated work merely because no event arrived.",
    "",
    "RE-RUN EXACT COMMAND:",
    "codework",
    "",
    "## REPORTING RULE",
    "",
    "CODEWORK WAITING REPORT:",
    `- Agent: ${options.agent.name}`,
    `- Workspace: ${options.state.workspace}`,
    `- Waiting for: directive or actionable event from ${leaderName}`,
    `- Consecutive empty polls: ${options.consecutiveEmptyPolls}`,
    "- Last poll command: codework",
    "- Next action: run codework again"
  );
  return lines;
}
function waitingForFollowTargetLines(state, agent, workspace) {
  if (!agent || agent.follow === "user" || agent.follow === "self") {
    return [];
  }
  const command = defaultPollCommand(workspace, agent.name);
  return [
    "",
    "## WAITING FOR FOLLOW TARGET",
    "",
    `STATE: waiting-for-directive-from-${agent.follow}`,
    `MUST: Poll for directives from ${agent.follow} before starting implementation.`,
    "MUST: Run the command below now.",
    `MUST NOT: begin implementation based only on the human's vague request if ${agent.follow} is your follow target.`,
    "",
    "RUN COMMAND:",
    command,
    "",
    findAgentByFollowValue(state, agent.follow) ? `FOLLOW TARGET STATUS: ${agent.follow} is registered.` : `FOLLOW TARGET STATUS: ${agent.follow} is not registered yet; keep polling until directives arrive.`
  ];
}
function defaultPollCommand(workspace, name) {
  return buildCanonicalPollCommand({
    kind: "poll",
    workspace,
    name,
    waitSeconds: 30,
    intervalSeconds: 2
  });
}
function pollFollowRuleLines(follow) {
  if (follow === "user") {
    return [
      "MUST: Wait for directives, questions, blockers, or completion signals from the workspace.",
      "MUST NOT: infer teammate state from silence."
    ];
  }
  if (follow === "self") {
    return [
      "MUST: Wait for actionable peer events before making claims about teammate progress.",
      "MUST NOT: infer teammate state from silence."
    ];
  }
  return [
    `MUST: Wait for directives, questions, blockers, or completion signals from ${follow}.`,
    `MUST NOT: infer ${follow}'s intent from silence.`
  ];
}
function structuredEventLines(events) {
  return events.flatMap((event) => {
    const lines = [
      `Event ${event.id}:`,
      `- TYPE: ${event.type}`,
      `- FROM: ${event.actor}`,
      `- TO: ${event.to ?? "all"}`
    ];
    if (event.kind) {
      lines.push(`- KIND: ${event.kind}`);
    }
    const message = eventText(event);
    if (message !== "") {
      lines.push("- MESSAGE:", ...indentMultiline(message));
    }
    return [...lines, ""];
  }).slice(0, -1);
}
function eventText(event) {
  const keys = ["message", "summary", "blockers", "next", "reason"];
  for (const key of keys) {
    const value = event.payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return JSON.stringify(event.payload);
}
function indentMultiline(value) {
  return value.split(/\r?\n/).map((line) => `  ${line}`);
}
function followTargetForCommand(follow) {
  return follow === "self" || follow === "user" ? "all" : follow;
}
function waitingForText(follow) {
  if (follow === "user" || follow === "self") {
    return "actionable workspace event";
  }
  return `directive or actionable event from ${follow}`;
}
function formatPollSeconds(value) {
  return `${Number.isInteger(value) ? value : String(value)}s`;
}

// src/commands/doctor.ts
async function runDoctorCommand(ctx) {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
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
      checks.push(`warn: workspace state not found for ${paths.workspace ?? "(directory default)"}`);
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
      workspace: paths.workspace,
      root: paths.root,
      home: paths.home,
      runtime: runtimeName(),
      checks,
      nextCommand: ctx.workspace ? `codework status --workspace=${ctx.workspace}` : "codework"
    }),
    quietText: "doctor=ok\n",
    json: {
      ok: true,
      command: "doctor",
      runtime: runtimeName(),
      root: paths.root,
      home: paths.home,
      workspace: paths.workspace,
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

// src/core/fingerprint.ts
import crypto2 from "crypto";
import os3 from "os";
import process5 from "process";
function detectAgentFingerprint(cwd) {
  const env = process5.env;
  const candidates = [
    ["CODEWORK_AGENT_ID", env.CODEWORK_AGENT_ID],
    ["TMUX_PANE", env.TMUX_PANE],
    ["TERM_SESSION_ID", env.TERM_SESSION_ID],
    ["WT_SESSION", env.WT_SESSION],
    ["KITTY_WINDOW_ID", env.KITTY_WINDOW_ID],
    ["ALACRITTY_WINDOW_ID", env.ALACRITTY_WINDOW_ID],
    ["VSCODE_PID", env.VSCODE_PID],
    ["process.ppid", String(process5.ppid || "")]
  ];
  for (const [source, value] of candidates) {
    if (value && value.trim() !== "") {
      return makeFingerprint(source, value);
    }
  }
  return makeFingerprint(
    "hostname+cwd+shell+ppid",
    `${safeHostname2()}|${cwd}|${env.SHELL ?? ""}|${process5.ppid || ""}`
  );
}
function makeFingerprint(source, value) {
  return {
    source,
    value,
    hash: crypto2.createHash("sha256").update(`${source}:${value}`).digest("hex").slice(0, 16)
  };
}
function safeHostname2() {
  try {
    return os3.hostname();
  } catch {
    return process5.env.HOSTNAME || "unknown";
  }
}

// src/core/identity.ts
function findAgentByFingerprint(state, fingerprintHash) {
  return Object.values(state.agents).find((agent) => agent.fingerprintHash === fingerprintHash);
}
function resolveAgentNameForCommand(state, ctx) {
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
function identityRequiredStdout() {
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

// src/commands/done.ts
async function runDoneCommand(ctx, options) {
  const summary = validateTextSize(options.summary ?? options.positionalSummary, "--summary");
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
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await loadState(paths.workspaceDir);
    if (!state) {
      if (!ctx.name) {
        throw new CodeworkError(2, "Agent identity is required.", identityRequiredStdout());
      }
      throw new CodeworkError(2, `Workspace does not exist: ${paths.workspace ?? "(unknown)"}`);
    }
    const name = resolveAgentNameForCommand(state, ctx);
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
          options.tests ? "Tests field was separately provided." : "Tests field was not separately provided.",
          "Notify your follow target if the report changes their next step.",
          `Run \`codework\` or \`codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2\` before the next substantial step.`
        ],
        recommendedCommand: `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2`
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

// src/commands/enter.ts
import process6 from "process";
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function runEnterCommand(ctx, options) {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const fingerprint = detectAgentFingerprint(paths.workspaceRoot ?? paths.root);
  const settings = normalizeEnterSettings(options);
  const registration = await registerAutoEnterAgent(ctx, options, fingerprint);
  if (registration.mode === "new-leader") {
    return resultFromAutoEnter(registration, [], [], settings);
  }
  const pollSettings = registration.agent.leadership === "leader" ? { ...settings, waitSeconds: 0, once: true } : settings;
  const poll = await boundedAutoPoll(paths.workspaceDir, registration.agent.name, pollSettings);
  return resultFromAutoEnter(
    {
      ...registration,
      state: poll.state,
      agent: poll.agent,
      leader: poll.leader ?? registration.leader
    },
    poll.actionableEvents,
    poll.nonActionableEvents,
    pollSettings
  );
}
function normalizeEnterSettings(options) {
  return {
    waitSeconds: options.once ? 0 : parseBoundedSeconds({
      cliValue: options.wait,
      envValue: process6.env.CODEWORK_POLL_WAIT_SECONDS,
      optionName: "--wait",
      fallback: 30,
      min: 0,
      max: 120
    }),
    intervalSeconds: parseBoundedSeconds({
      cliValue: options.interval,
      envValue: process6.env.CODEWORK_POLL_INTERVAL_SECONDS,
      optionName: "--interval",
      fallback: 2,
      min: 1,
      max: 10
    }),
    once: Boolean(options.once)
  };
}
async function registerAutoEnterAgent(ctx, options, fingerprint) {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const loaded = await loadState(paths.workspaceDir);
    const state = loaded ?? createWorkspaceState(paths, paths.workspace ?? "workspace");
    const events = [];
    let warning;
    const existing = findAgentByFingerprint(state, fingerprint.hash);
    if (existing) {
      existing.lastSeenAt = (/* @__PURE__ */ new Date()).toISOString();
      existing.active = true;
      state.updatedAt = existing.lastSeenAt;
      await saveState(paths.workspaceDir, state);
      return {
        state,
        agent: existing,
        leader: resolveLeader(state).leader,
        mode: existing.leadership === "leader" ? "existing-leader" : "existing-follower"
      };
    }
    if (!loaded || Object.values(state.agents).filter((agent2) => agent2.active).length === 0) {
      const leaderName = autoName(ctx, "leader");
      const { agent: agent2 } = addOrRejoinAgent(state, {
        name: leaderName,
        follow: normalizeFollow(options.follow ?? "user"),
        role: "leader",
        cursorEventId: 0,
        fingerprintHash: fingerprint.hash,
        fingerprintSource: fingerprint.source,
        autoNamed: !ctx.name && !process6.env.CODEWORK_AGENT_NAME,
        leadership: "leader"
      });
      state.leaderAgent = agent2.name;
      if (!loaded) {
        events.push(
          createEvent(state, {
            actor: agent2.name,
            type: "workspace.created",
            payload: {
              workspaceKind: state.workspaceKind,
              workspaceRoot: state.workspaceRoot,
              defaultApplied: "follow=user"
            }
          })
        );
      }
      events.push(
        createEvent(state, {
          actor: agent2.name,
          type: "agent.joined",
          payload: {
            name: agent2.name,
            follow: agent2.follow,
            leadership: agent2.leadership,
            fingerprintSource: agent2.fingerprintSource
          }
        })
      );
      agent2.cursorEventId = latestEventId(state);
      await appendEvents(paths.workspaceDir, events);
      await saveState(paths.workspaceDir, state);
      return { state, agent: agent2, leader: agent2, mode: "new-leader" };
    }
    const leaderResult = resolveLeader(state);
    if (leaderResult.warning) {
      warning = leaderResult.warning;
      const workspaceWarning = {
        code: "leader.selected",
        message: warning,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      state.warnings.push(workspaceWarning);
      events.push(
        createEvent(state, {
          actor: leaderResult.leader.name,
          type: "warning.created",
          to: "all",
          payload: workspaceWarning
        })
      );
    }
    const leader = leaderResult.leader;
    const followerName = autoName(ctx, nextWorkerName(state));
    const { agent } = addOrRejoinAgent(state, {
      name: followerName,
      follow: leader.name,
      role: "follower engineer",
      cursorEventId: latestEventId(state),
      fingerprintHash: fingerprint.hash,
      fingerprintSource: fingerprint.source,
      autoNamed: !ctx.name && !process6.env.CODEWORK_AGENT_NAME,
      leadership: "follower"
    });
    events.push(
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          follow: agent.follow,
          leadership: agent.leadership,
          fingerprintSource: agent.fingerprintSource
        }
      })
    );
    await appendEvents(paths.workspaceDir, events);
    await saveState(paths.workspaceDir, state);
    return { state, agent, leader, mode: "new-follower", warning };
  });
}
async function boundedAutoPoll(workspaceDir, agentName, settings) {
  const startedAt = Date.now();
  let read = await readAutoPoll(workspaceDir, agentName);
  while (read.actionableEvents.length === 0 && !settings.once && settings.waitSeconds > 0 && Date.now() - startedAt < settings.waitSeconds * 1e3) {
    const remainingMs = startedAt + settings.waitSeconds * 1e3 - Date.now();
    await sleep2(Math.min(settings.intervalSeconds * 1e3, Math.max(0, remainingMs)));
    read = await readAutoPoll(workspaceDir, agentName);
  }
  return finalizeAutoPoll(workspaceDir, agentName);
}
async function readAutoPoll(workspaceDir, agentName) {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await loadState(workspaceDir);
    if (!state) {
      throw new Error("workspace state disappeared during auto-enter");
    }
    const agent = findAgent(state, agentName);
    if (!agent) {
      throw new Error("agent state disappeared during auto-enter");
    }
    const leader = resolveLeader(state).leader;
    const events = relevantUnreadEvents(state, await readEvents(workspaceDir), agent);
    return splitAutoEvents(state, agent, leader, events);
  });
}
async function finalizeAutoPoll(workspaceDir, agentName) {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await loadState(workspaceDir);
    if (!state) {
      throw new Error("workspace state disappeared during auto-enter");
    }
    const agent = findAgent(state, agentName);
    if (!agent) {
      throw new Error("agent state disappeared during auto-enter");
    }
    const leader = resolveLeader(state).leader;
    const events = relevantUnreadEvents(state, await readEvents(workspaceDir), agent);
    const split = splitAutoEvents(state, agent, leader, events);
    const maxDisplayedEventId = events.reduce((max, event) => Math.max(max, event.id), 0);
    agent.cursorEventId = maxDisplayedEventId > 0 ? maxDisplayedEventId : latestEventId(state);
    agent.lastSeenAt = (/* @__PURE__ */ new Date()).toISOString();
    agent.lastPollAt = agent.lastSeenAt;
    agent.lastPollCommand = "codework";
    agent.lastPollEmptyCount = split.actionableEvents.length > 0 ? 0 : (agent.lastPollEmptyCount ?? 0) + 1;
    state.updatedAt = agent.lastSeenAt;
    await saveState(workspaceDir, state);
    return splitAutoEvents(state, agent, leader, events);
  });
}
function splitAutoEvents(state, agent, leader, events) {
  const actionableEvents = events.filter((event) => isAutoActionableEvent(agent, event));
  return {
    state,
    agent,
    leader,
    actionableEvents,
    nonActionableEvents: events.filter((event) => !isAutoActionableEvent(agent, event))
  };
}
function isAutoActionableEvent(agent, event) {
  if (agent.leadership === "leader") {
    if (event.type === "warning.created") {
      return true;
    }
    if (event.type === "work.done" && event.actor !== agent.name) {
      return true;
    }
    return event.type === "message.posted" && (event.kind === "question" || event.kind === "blocker" || event.kind === "directive");
  }
  return isActionableEvent(event, agent);
}
function resolveLeader(state) {
  const explicit = state.leaderAgent ? findAgent(state, state.leaderAgent) : void 0;
  if (explicit?.active) {
    explicit.leadership = "leader";
    return { leader: explicit };
  }
  const activeAgents = Object.values(state.agents).filter((agent) => agent.active).sort((a, b) => (a.joinOrder ?? 0) - (b.joinOrder ?? 0) || a.joinedAt.localeCompare(b.joinedAt));
  const selected = activeAgents.find((agent) => agent.follow === "user") ?? activeAgents[0];
  if (!selected) {
    throw new Error("No active leader candidate exists.");
  }
  selected.leadership = "leader";
  selected.follow = selected.follow || "user";
  state.leaderAgent = selected.name;
  return {
    leader: selected,
    warning: "No explicit leader was found. Codework selected the earliest active participant as temporary leader."
  };
}
function autoName(ctx, fallback) {
  const requested = ctx.name ?? process6.env.CODEWORK_AGENT_NAME ?? fallback;
  return slugifyIdentifier(requested, "--name").value;
}
function nextWorkerName(state) {
  const used = new Set(Object.values(state.agents).map((agent) => agent.name));
  let index = Math.max(2, Object.keys(state.agents).length + 1);
  while (used.has(`worker-${index}`)) {
    index += 1;
  }
  return `worker-${index}`;
}
function resultFromAutoEnter(registration, actionableEvents, nonActionableEvents, settings) {
  return {
    text: renderAutoEnter({
      state: registration.state,
      agent: registration.agent,
      leader: registration.leader,
      actionableEvents,
      nonActionableEvents,
      waitSeconds: settings.waitSeconds,
      intervalSeconds: settings.intervalSeconds,
      consecutiveEmptyPolls: registration.agent.lastPollEmptyCount ?? 0,
      mode: registration.mode,
      warning: registration.warning
    }),
    quietText: `${registration.agent.leadership}=${registration.agent.name}
`,
    json: {
      ok: true,
      command: "enter",
      workspace: registration.state.workspace,
      workspaceSlug: registration.state.workspaceSlug,
      agent: registration.agent,
      leader: registration.leader,
      actionableEvents,
      nonActionableEvents
    }
  };
}

// src/commands/guide.ts
async function runGuideCommand(ctx) {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const name = resolveAgentNameForCommand(state, ctx);
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
      recommendedCommand: `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2`
    }),
    quietText: `workspace=${state.workspace} agent=${agent.name} guide
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
      cursorEventId: rejoinCursorSeed(stateHasAgent(state, name.slug), existingLatest),
      autoNamed: false,
      leadership: follow === "user" && !state.leaderAgent ? "leader" : "follower"
    });
    if (agent.leadership === "leader" && !state.leaderAgent) {
      state.leaderAgent = agent.name;
    }
    const events = [
      createEvent(state, {
        actor: agent.name,
        type: "agent.joined",
        payload: {
          name: agent.name,
          role: agent.role,
          follow: agent.follow,
          leadership: agent.leadership,
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
        recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
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
      cursorEventId: 0,
      autoNamed: false,
      leadership: "leader"
    });
    state.leaderAgent = agent.name;
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
          leadership: agent.leadership,
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
      recommendedCommand: `codework poll --workspace=${workspace.value} --name=${agent.name} --wait=30 --interval=2`
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
import process7 from "process";
var sleep3 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function runPollCommand(ctx, options, commandKind = "poll") {
  const settings = normalizePollSettings(options);
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const name = await resolvePollAgentName(paths.workspaceDir, ctx);
  const canonicalCommand = canonicalPollCommand(commandKind, ctx, paths.workspace ?? "workspace", name, settings);
  const nextPollCommand = canonicalPollCommand("poll", ctx, paths.workspace ?? "workspace", name, settings);
  const startedAt = Date.now();
  let readResult;
  while (true) {
    readResult = await readPollEvents(paths.workspaceDir, name, settings);
    if (readResult.actionableEvents.length > 0 || settings.once || settings.waitSeconds === 0) {
      break;
    }
    const remainingMs = startedAt + settings.waitSeconds * 1e3 - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep3(Math.min(settings.intervalSeconds * 1e3, remainingMs));
  }
  const finalResult = await finalizePoll(paths.workspaceDir, name, settings, canonicalCommand);
  const pollResult = finalResult.actionableEvents.length > 0 ? "actionable-events-found" : "timeout-without-actionable-event";
  return {
    text: renderPollResult({
      title: commandKind === "wait" ? "# CODEWORK WAIT RESULT" : "# CODEWORK POLL RESULT",
      state: finalResult.state,
      agent: finalResult.agent,
      actionableEvents: finalResult.actionableEvents,
      nonActionableEvents: finalResult.nonActionableEvents,
      waitSeconds: settings.once ? 0 : settings.waitSeconds,
      intervalSeconds: settings.intervalSeconds,
      pollResult,
      canonicalCommand,
      nextPollCommand
    }),
    quietText: finalResult.actionableEvents.length === 0 ? `actionable=0 emptyPolls=${finalResult.agent.lastPollEmptyCount ?? 0}
` : `actionable=${finalResult.actionableEvents.length}
`,
    json: {
      ok: true,
      command: commandKind,
      workspace: finalResult.state.workspace,
      agent: finalResult.agent,
      pollResult,
      waitSeconds: settings.waitSeconds,
      intervalSeconds: settings.intervalSeconds,
      actionableEvents: finalResult.actionableEvents,
      nonActionableEvents: finalResult.nonActionableEvents,
      cursorEventId: finalResult.agent.cursorEventId,
      canonicalCommand
    }
  };
}
async function resolvePollAgentName(workspaceDir, ctx) {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await requireState({ workspaceDir, cwd: "", root: "", home: "" });
    return resolveAgentNameForCommand(state, ctx);
  });
}
function canonicalPollCommand(kind, ctx, workspace, name, settings) {
  if (!ctx.workspace && !ctx.name) {
    return `codework ${kind} --wait=${settings.waitSeconds} --interval=${settings.intervalSeconds}`;
  }
  if (!ctx.workspace) {
    return `codework ${kind} --name=${shellQuote(name)} --wait=${settings.waitSeconds} --interval=${settings.intervalSeconds}`;
  }
  if (!ctx.name) {
    return `codework ${kind} --workspace=${shellQuote(ctx.workspace)} --wait=${settings.waitSeconds} --interval=${settings.intervalSeconds}`;
  }
  return buildCanonicalPollCommand({
    kind,
    workspace,
    name,
    waitSeconds: settings.waitSeconds,
    intervalSeconds: settings.intervalSeconds
  });
}
function normalizePollSettings(options) {
  const waitSeconds = options.once ? 0 : parseBoundedSeconds({
    cliValue: options.wait,
    envValue: process7.env.CODEWORK_POLL_WAIT_SECONDS,
    optionName: "--wait",
    fallback: 30,
    min: 0,
    max: 120
  });
  const intervalSeconds = parseBoundedSeconds({
    cliValue: options.interval,
    envValue: process7.env.CODEWORK_POLL_INTERVAL_SECONDS,
    optionName: "--interval",
    fallback: 2,
    min: 1,
    max: 10
  });
  return {
    waitSeconds,
    intervalSeconds,
    once: Boolean(options.once),
    since: options.since === void 0 ? void 0 : parsePositiveInteger(options.since, "--since", 0),
    tail: options.tail === void 0 ? void 0 : parsePositiveInteger(options.tail, "--tail", 0)
  };
}
async function readPollEvents(workspaceDir, name, settings) {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await requireState({ workspaceDir, cwd: "", root: "", home: "" });
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const events = await readEvents(workspaceDir);
    return buildPollReadResult(state, agent, events, settings);
  });
}
async function finalizePoll(workspaceDir, name, settings, canonicalCommand) {
  return withWorkspaceLock(workspaceDir, async () => {
    const state = await requireState({ workspaceDir, cwd: "", root: "", home: "" });
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const events = await readEvents(workspaceDir);
    const result = buildPollReadResult(state, agent, events, settings);
    const maxDisplayedEventId = result.displayedEvents.reduce((max, event) => Math.max(max, event.id), 0);
    agent.cursorEventId = maxDisplayedEventId > 0 ? maxDisplayedEventId : latestEventId(state);
    agent.lastSeenAt = (/* @__PURE__ */ new Date()).toISOString();
    agent.lastPollAt = agent.lastSeenAt;
    agent.lastPollCommand = canonicalCommand;
    agent.lastPollEmptyCount = result.actionableEvents.length > 0 ? 0 : (agent.lastPollEmptyCount ?? 0) + 1;
    state.updatedAt = agent.lastSeenAt;
    await saveState(workspaceDir, state);
    return result;
  });
}
function buildPollReadResult(state, agent, allEvents, settings) {
  const unread = relevantUnreadEvents(state, allEvents, agent, settings.since);
  const displayedEvents = settings.tail === void 0 ? unread : unread.slice(0, settings.tail);
  const actionableEvents = displayedEvents.filter((event) => isActionableEvent(event, agent));
  const nonActionableEvents = displayedEvents.filter((event) => !isActionableEvent(event, agent));
  return {
    state,
    agent,
    displayedEvents,
    actionableEvents,
    nonActionableEvents
  };
}

// src/commands/say.ts
async function runSayCommand(ctx, options) {
  const message = validateTextSize(options.message ?? options.positionalMessage, "--message");
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  return withWorkspaceLock(paths.workspaceDir, async () => {
    const state = await loadState(paths.workspaceDir);
    if (!state) {
      if (!ctx.name) {
        throw new CodeworkError(2, "Agent identity is required.", identityRequiredStdout());
      }
      throw new CodeworkError(2, `Workspace does not exist: ${paths.workspace ?? "(unknown)"}`);
    }
    const name = resolveAgentNameForCommand(state, ctx);
    const agent = findAgent(state, name);
    if (!agent) {
      throw new CodeworkError(2, `Agent is not registered in workspace: ${name}`);
    }
    const requestedTo = normalizeTo(options.positionalTo ?? options.to);
    const kind = validateMessageKind(options.kind ?? defaultMessageKind(state, agent, requestedTo));
    const to = kind === "blocker" ? "all" : requestedTo;
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
        recommendedCommand: `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2`
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
function defaultMessageKind(state, agent, to) {
  const target = Object.values(state.agents).find((candidate) => candidate.name === to);
  return agent.leadership === "leader" && target?.leadership === "follower" ? "directive" : "note";
}

// src/commands/status.ts
async function runStatusCommand(ctx) {
  const paths = resolveCodeworkPaths({
    cwd: ctx.cwd,
    home: ctx.home,
    workspace: ctx.workspace,
    debug: ctx.debug
  });
  const state = await requireState(paths);
  const events = await readEvents(paths.workspaceDir);
  const agentName = optionalAgentName(state, ctx);
  const agent = findAgent(state, agentName);
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
      agentName,
      unreadEvents: unread,
      allEvents: events,
      notice,
      recommendedCommand: agent ? `codework poll --workspace=${state.workspace} --name=${agent.name} --wait=30 --interval=2` : "codework status",
      statusMode: true
    }),
    quietText: `workspace=${state.workspace} agents=${Object.keys(state.agents).length}
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
function optionalAgentName(state, ctx) {
  try {
    return resolveAgentNameForCommand(state, ctx);
  } catch {
    return ctx.name;
  }
}

// src/commands/wait.ts
async function runWaitCommand(ctx, options) {
  return runPollCommand(ctx, options, "wait");
}

// src/cli.ts
var defaultIo = {
  stdout: (text) => process8.stdout.write(text),
  stderr: (text) => process8.stderr.write(text)
};
async function main(argv = process8.argv, io = defaultIo) {
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
  program.option("--wait <seconds>", "Maximum seconds for auto-enter bounded poll.").option("--interval <seconds>", "Seconds between auto-enter poll checks.").option("--once", "Read once without waiting during auto-enter.").option("--follow <user|self|agent>", "Explicit follow mode for first auto-enter leader.");
  program.action(async (...args) => {
    const command = commandFromActionArgs(args);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runEnterCommand(ctx, optionsFrom(command)));
  });
  addCommonOptions(program.command("enter").description("Enter the current directory workspace automatically.")).option("--wait <seconds>", "Maximum seconds for bounded poll.").option("--interval <seconds>", "Seconds between poll checks.").option("--once", "Read once without waiting.").option("--follow <user|self|agent>", "Explicit follow mode for first auto-enter leader.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runEnterCommand(ctx, optionsFrom(command)));
  });
  addCommonOptions(program.command("new").description("Create a new Codework workspace and register the first agent.")).option("--follow <user|self|agent>", "Authority/follow target.").option("--role <text>", "Agent role.").option("--goal <text>", "Workspace goal.").option("--force", "Recreate an existing workspace.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const options = optionsFrom(command);
    requireNewOptions(options);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runNewCommand(ctx, options));
  });
  addCommonOptions(program.command("join").description("Join an existing Codework workspace.")).option("--follow <user|self|agent>", "Authority/follow target.").option("--role <text>", "Agent role.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const options = optionsFrom(command);
    requireJoinOptions(options);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runJoinCommand(ctx, options));
  });
  addCommonOptions(program.command("guide").description("Reprint the complete operational guide for an agent.")).action(
    async (...args) => {
      const command = commandFromActionArgs(args);
      const ctx = contextFrom(command);
      await emitResult(io, ctx, await runGuideCommand(ctx));
    }
  );
  addCommonOptions(program.command("status").description("Print workspace state, agents, follow graph, and latest events.")).action(
    async (...args) => {
      const command = commandFromActionArgs(args);
      const ctx = contextFrom(command);
      await emitResult(io, ctx, await runStatusCommand(ctx));
    }
  );
  addCommonOptions(program.command("poll").description("Read unread events for the calling agent.")).option("--wait <seconds>", "Maximum seconds to wait for new actionable events.").option("--interval <seconds>", "Seconds between event log checks.").option("--since <eventId>", "Read events after this event id.").option("--tail <n>", "Limit unread events.").option("--once", "Read once without waiting.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runPollCommand(ctx, optionsFrom(command)));
  });
  addCommonOptions(program.command("wait").description("Wait for actionable events for the calling agent.")).option("--wait <seconds>", "Maximum seconds to wait for new actionable events.").option("--interval <seconds>", "Seconds between event log checks.").option("--since <eventId>", "Read events after this event id.").option("--tail <n>", "Limit unread events.").option("--once", "Read once without waiting.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runWaitCommand(ctx, optionsFrom(command)));
  });
  addCommonOptions(program.command("say [to] [message...]").description("Post a message event to the workspace.")).option("--message <text>", "Message body.").option("--to <agent|all>", "Recipient.", "all").option("--kind <note|directive|question|blocker>", "Message kind.").action(async (to, message, _options, command) => {
    const ctx = contextFrom(command);
    await emitResult(
      io,
      ctx,
      await runSayCommand(ctx, {
        ...optionsFrom(command),
        positionalTo: to,
        positionalMessage: message?.join(" ")
      })
    );
  });
  addCommonOptions(program.command("done [summary...]").description("Record completed or intermediate work.")).option("--summary <text>", "Work summary.").option("--tests <text>", "Tests or verification.").option("--changed <text>", "Files or areas changed.").option("--next <text>", "Next step.").option("--blockers <text>", "Remaining blockers.").action(async (summary, _options, command) => {
    const ctx = contextFrom(command);
    await emitResult(
      io,
      ctx,
      await runDoneCommand(ctx, {
        ...optionsFrom(command),
        positionalSummary: summary?.join(" ")
      })
    );
  });
  addCommonOptions(program.command("log").description("Read workspace event log.")).option("--tail <n>", "Number of latest events.", "50").option("--json", "Emit JSON for log command.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const ctx = contextFrom(command);
    const options = optionsFrom(command);
    const result = await runLogCommand(ctx, options);
    const local = options;
    await emitResult(io, local.json ? { ...ctx, format: "json" } : ctx, result);
  });
  addCommonOptions(program.command("leave").description("Mark an agent inactive.")).option("--reason <text>", "Reason for leaving.").action(async (...args) => {
    const command = commandFromActionArgs(args);
    const ctx = contextFrom(command);
    await emitResult(io, ctx, await runLeaveCommand(ctx, optionsFrom(command)));
  });
  addCommonOptions(program.command("doctor").description("Check runtime, write access, lock behavior, and state integrity.")).action(
    async (...args) => {
      const command = commandFromActionArgs(args);
      const ctx = contextFrom(command);
      await emitResult(io, ctx, await runDoctorCommand(ctx));
    }
  );
  return program;
}
function commandFromActionArgs(args) {
  const command = args.at(-1);
  if (command instanceof Command) {
    return command;
  }
  throw new CodeworkError(1, "Unable to resolve Commander action context.");
}
function optionsFrom(command) {
  return command.optsWithGlobals();
}
function addCommonOptions(command, withDefaults = false) {
  command.option("--workspace <id>", "Workspace id.").option("--name <agent>", "Calling agent name.").option("--format <format>", "text | json.", withDefaults ? "text" : void 0).option("--quiet", "Only print machine/minimal output.").option("--debug", "Print diagnostics to stderr.").option("--cwd <path>", "Repository/work root.", withDefaults ? process8.cwd() : void 0).option("--home <path>", "Override Codework home.").option("--no-color", "Do not emit ANSI color.");
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
    cwd: merged.cwd ?? process8.cwd(),
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
  if (error.stdout) {
    io.stdout(error.stdout);
    return;
  }
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
if (isDirectRun()) {
  const code = await main();
  process8.exit(code);
}
function isDirectRun() {
  const argvPath = process8.argv[1];
  if (!argvPath) {
    return false;
  }
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync2(modulePath) === realpathSync2(argvPath);
  } catch {
    return modulePath === argvPath;
  }
}
export {
  main
};
