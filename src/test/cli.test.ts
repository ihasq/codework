import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { main } from "../cli.ts";

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "codework-test-"));
}

async function run(args: string[], cwd: string): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const code = await main(["node", "codework", ...args, "--cwd", cwd], {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });
  return { code, stdout, stderr };
}

async function runWithEnv(args: string[], cwd: string, env: Record<string, string>): Promise<RunResult> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await run(args, cwd);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function workspaceDir(root: string, workspace: string): string {
  return path.join(root, ".codework", "workspaces", workspace);
}

async function readEvents(root: string, workspace: string): Promise<unknown[]> {
  const raw = await readFile(path.join(workspaceDir(root, workspace), "events.ndjson"), "utf8");
  return raw
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

async function readDirectoryState(root: string): Promise<{ agents: Record<string, { name: string; leadership: string; sessionCount: number }> }> {
  const workspacesDir = path.join(root, ".codework", "workspaces");
  const entries = await readdir(workspacesDir);
  const raw = await readFile(path.join(workspacesDir, entries[0], "state.json"), "utf8");
  return JSON.parse(raw) as { agents: Record<string, { name: string; leadership: string; sessionCount: number }> };
}

function normalizeForSnapshot(stdout: string): string {
  return stdout
    .split(/\r?\n/)
    .filter((line) => {
      if (line.startsWith("# ")) return true;
      if (line.startsWith("## ")) return true;
      if (/^(WORKSPACE|AGENT|FOLLOW|AUTHORITY MODE|POLL RESULT|CONSECUTIVE EMPTY POLLS):/.test(line)) return true;
      if (line.startsWith("MUST:")) return true;
      if (line.startsWith("MUST NOT:")) return true;
      if (line.startsWith("CODEWORK REPORT:")) return true;
      if (line.startsWith("No actionable events arrived")) return true;
      if (line.startsWith("RE-RUN EXACT COMMAND:")) return true;
      if (line.startsWith("NEXT POLL COMMAND AFTER HANDLING:")) return true;
      if (line.startsWith("RUN COMMAND:")) return true;
      if (line.startsWith("codework poll ")) return true;
      if (line.startsWith("codework wait ")) return true;
      if (line.startsWith("- codework ")) return true;
      return false;
    })
    .join("\n");
}

describe("codework CLI", () => {
  test("zero-argument codework creates a directory leader with follow=user", async () => {
    const root = await tempRoot();

    const entered = await runWithEnv([], root, { TMUX_PANE: "%1" });

    expect(entered.code).toBe(0);
    expect(entered.stdout).toContain("# CODEWORK AUTO-ENTER");
    expect(entered.stdout).toContain("AGENT: leader");
    expect(entered.stdout).toContain("ROLE: leader");
    expect(entered.stdout).toContain("FOLLOW: user");
    expect(entered.stdout).toContain("AUTHORITY MODE: user-led coordinator");
    expect(entered.stdout).toContain("DEFAULT APPLIED: follow=user");
  });

  test("enter alias creates the same auto-enter leader", async () => {
    const root = await tempRoot();

    const entered = await runWithEnv(["enter"], root, { TMUX_PANE: "%1" });

    expect(entered.code).toBe(0);
    expect(entered.stdout).toContain("# CODEWORK AUTO-ENTER");
    expect(entered.stdout).toContain("AGENT: leader");
    expect(entered.stdout).toContain("FOLLOW: user");
  });

  test("second fingerprint joins as follower and empty auto-enter reruns codework", async () => {
    const root = await tempRoot();

    await runWithEnv([], root, { TMUX_PANE: "%1" });
    const follower = await runWithEnv(["--wait=0"], root, { TMUX_PANE: "%2" });

    expect(follower.code).toBe(0);
    expect(follower.stdout).toContain("AGENT: worker-2");
    expect(follower.stdout).toContain("ROLE: follower engineer");
    expect(follower.stdout).toContain("FOLLOW: leader");
    expect(follower.stdout).toContain("You have an earlier participant in this workspace.");
    expect(follower.stdout).toContain("That earlier participant is the leader for this directory workspace.");
    expect(follower.stdout).toContain("MUST: Run the exact command below again.");
    expect(follower.stdout).toContain("RE-RUN EXACT COMMAND:\ncodework");
  });

  test("leader short say sends directive and follower receives it with codework", async () => {
    const root = await tempRoot();

    await runWithEnv([], root, { TMUX_PANE: "%1" });
    await runWithEnv(["--wait=0"], root, { TMUX_PANE: "%2" });
    const said = await runWithEnv(["say", "worker-2", "Implement Todo app."], root, { TMUX_PANE: "%1" });
    const follower = await runWithEnv(["--wait=0"], root, { TMUX_PANE: "%2" });

    expect(said.code).toBe(0);
    expect(follower.stdout).toContain("## ACTIONABLE EVENTS");
    expect(follower.stdout).toContain("- FROM: leader");
    expect(follower.stdout).toContain("- KIND: directive");
    expect(follower.stdout).toContain("  Implement Todo app.");
    expect(follower.stdout).toContain("MUST: Handle the directive above now.");
  });

  test("same fingerprint does not create duplicate workers", async () => {
    const root = await tempRoot();

    await runWithEnv([], root, { TMUX_PANE: "%1" });
    await runWithEnv([], root, { TMUX_PANE: "%1" });
    await runWithEnv(["status"], root, { TMUX_PANE: "%1" });
    const state = await readDirectoryState(root);

    expect(Object.values(state.agents).map((agent) => agent.name)).toEqual(["leader"]);
  });

  test("workspace and name can be omitted after auto-enter", async () => {
    const root = await tempRoot();

    await runWithEnv([], root, { TMUX_PANE: "%1" });
    const status = await runWithEnv(["status"], root, { TMUX_PANE: "%1" });
    const guide = await runWithEnv(["guide"], root, { TMUX_PANE: "%1" });
    const poll = await runWithEnv(["poll", "--wait=0"], root, { TMUX_PANE: "%1" });

    expect(status.code).toBe(0);
    expect(guide.code).toBe(0);
    expect(poll.code).toBe(0);
    expect(status.stdout).toContain("AGENT: leader");
    expect(guide.stdout).toContain("AGENT: leader");
  });

  test("short done resolves current fingerprint and identity error appears before enter", async () => {
    const root = await tempRoot();
    const beforeEnter = await runWithEnv(["done", "Finished implementation."], root, { TMUX_PANE: "%1" });

    await runWithEnv([], root, { TMUX_PANE: "%1" });
    const done = await runWithEnv(["done", "Finished implementation."], root, { TMUX_PANE: "%1" });

    expect(beforeEnter.code).toBe(2);
    expect(beforeEnter.stdout).toContain("# CODEWORK IDENTITY REQUIRED");
    expect(done.code).toBe(0);
    expect(done.stdout).toContain("Tests field was not separately provided.");
  });

  test("path workspace uses a separate directory workspace root", async () => {
    const current = await tempRoot();
    const other = await tempRoot();

    const currentEnter = await runWithEnv([], current, { TMUX_PANE: "%1" });
    const otherEnter = await runWithEnv([`--workspace=${other}`], current, { TMUX_PANE: "%2" });

    expect(currentEnter.stdout).toContain(`WORKSPACE ROOT: ${current}`);
    expect(otherEnter.stdout).toContain(`WORKSPACE ROOT: ${other}`);
  });

  test("accepts key=value compatibility for workspace/name/follow", async () => {
    const first = await tempRoot();
    const second = await tempRoot();

    const one = await run(["new", "workspace=my-workspace", "--name=codex", "--follow=user"], first);
    const two = await run(["new", "--workspace=my-workspace", "name=codex", "follow=user"], second);

    expect(one.code).toBe(0);
    expect(two.code).toBe(0);
    expect(one.stdout).toContain("WORKSPACE: my-workspace");
    expect(two.stdout).toContain("WORKSPACE: my-workspace");
    expect(one.stdout).toContain("AGENT: codex");
    expect(two.stdout).toContain("AGENT: codex");
    expect(one.stdout).toContain("FOLLOW: user");
    expect(two.stdout).toContain("FOLLOW: user");
  });

  test("join registers a second agent and status shows both agents", async () => {
    const root = await tempRoot();

    expect((await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root)).code).toBe(0);
    expect((await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root)).code).toBe(0);
    const status = await run(["status", "--workspace=w"], root);

    expect(status.code).toBe(0);
    expect(status.stdout).toContain("- codex: active, follow=user");
    expect(status.stdout).toContain("- claude: active, follow=codex");
    expect(status.stdout).toContain("- codex -> user");
    expect(status.stdout).toContain("- claude -> codex");
  });

  test("poll advances the agent cursor after unread events are displayed", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    await run(
      ["say", "--workspace=w", "--name=codex", "--to=claude", "--kind=directive", "--message=Inspect tests."],
      root
    );

    const firstPoll = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);
    const secondPoll = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);

    expect(firstPoll.code).toBe(0);
    expect(firstPoll.stdout).toContain("KIND: directive");
    expect(firstPoll.stdout).toContain("Inspect tests.");
    expect(secondPoll.code).toBe(0);
    expect(secondPoll.stdout).toContain("WAIT CONTINUATION REQUIRED");
    expect(secondPoll.stdout).toContain("MUST NOT: treat this empty poll as task completion.");
  });

  test("parallel say operations keep event ids sequential and valid JSON", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        run(["say", "--workspace=w", "--name=codex", "--to=all", "--kind=note", `--message=note ${index}`], root)
      )
    );

    expect(results.every((result) => result.code === 0)).toBe(true);
    const events = (await readEvents(root, "w")) as Array<{ id: number }>;
    expect(events).toHaveLength(22);
    expect(events.map((event) => event.id)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
  });

  test("LLM-facing commands keep critical stdout headings", async () => {
    const root = await tempRoot();

    const created = await run(["new", "--workspace=snap", "--name=codex", "--follow=user"], root);
    const joined = await run(["join", "--workspace=snap", "--name=claude", "--follow=codex"], root);
    const guide = await run(["guide", "--workspace=snap", "--name=codex"], root);
    const status = await run(["status", "--workspace=snap", "--name=codex"], root);
    const poll = await run(["poll", "--workspace=snap", "--name=claude", "--wait=0"], root);
    const done = await run(["done", "--workspace=snap", "--name=codex", "--summary=Implemented snapshot case."], root);

    expect([
      normalizeForSnapshot(created.stdout),
      normalizeForSnapshot(joined.stdout),
      normalizeForSnapshot(guide.stdout),
      normalizeForSnapshot(status.stdout),
      normalizeForSnapshot(poll.stdout),
      normalizeForSnapshot(done.stdout)
    ]).toMatchSnapshot();
  });

  test("empty poll forces wait continuation with canonical repeat command", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    const poll = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);

    expect(poll.code).toBe(0);
    expect(poll.stdout).toContain("POLL RESULT: timeout-without-actionable-event");
    expect(poll.stdout).toContain("## WAIT CONTINUATION REQUIRED");
    expect(poll.stdout).toContain("MUST: Run the exact command below again.");
    expect(poll.stdout).toContain("MUST NOT: treat this empty poll as task completion.");
    expect(poll.stdout).toContain("RE-RUN EXACT COMMAND:\ncodework poll --workspace=w --name=claude --wait=0 --interval=2");
  });

  test("actionable poll instructs handling instead of wait continuation", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    await run(
      ["say", "--workspace=w", "--name=codex", "--to=claude", "--kind=directive", "--message=Run npm test."],
      root
    );
    const poll = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);

    expect(poll.code).toBe(0);
    expect(poll.stdout).toContain("POLL RESULT: actionable-events-found");
    expect(poll.stdout).toContain("## ACTIONABLE EVENTS");
    expect(poll.stdout).toContain("- KIND: directive");
    expect(poll.stdout).toContain("MUST: Handle the actionable event above before polling again.");
    expect(poll.stdout).toContain("NEXT POLL COMMAND AFTER HANDLING:");
    expect(poll.stdout).not.toContain("## WAIT CONTINUATION REQUIRED");
  });

  test("non-actionable-only poll keeps waiting and does not append poll events", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    const before = await readEvents(root, "w");
    await run(["join", "--workspace=w", "--name=reviewer", "--follow=codex"], root);
    const poll = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);
    const after = await readEvents(root, "w");

    expect(before).toHaveLength(3);
    expect(after).toHaveLength(4);
    expect(poll.stdout).toContain("POLL RESULT: timeout-without-actionable-event");
    expect(poll.stdout).toContain("## OBSERVED NON-ACTIONABLE EVENTS");
    expect(poll.stdout).toContain("- TYPE: agent.joined");
    expect(poll.stdout).toContain("## WAIT CONTINUATION REQUIRED");
  });

  test("join guide tells followers to poll instead of rejoining", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    const joined = await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);

    expect(joined.stdout).toContain("## WAITING FOR FOLLOW TARGET");
    expect(joined.stdout).toContain("MUST: Poll for directives from codex before starting implementation.");
    expect(joined.stdout).toContain("RUN COMMAND:\ncodework poll --workspace=w --name=claude --wait=30 --interval=2");
    expect(joined.stdout).not.toContain("RUN COMMAND:\ncodework join");
  });

  test("guide and status with agent name tell followers to poll", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    const guide = await run(["guide", "--workspace=w", "--name=claude"], root);
    const status = await run(["status", "--workspace=w", "--name=claude"], root);

    for (const output of [guide.stdout, status.stdout]) {
      expect(output).toContain("## WAITING FOR FOLLOW TARGET");
      expect(output).toContain("MUST: Poll for directives from codex before starting implementation.");
      expect(output).toContain("RUN COMMAND:\ncodework poll --workspace=w --name=claude --wait=30 --interval=2");
      expect(output).not.toContain("RUN COMMAND:\ncodework join");
    }
  });

  test("consecutive empty poll count increments and resets on actionable event", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);

    const first = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);
    const second = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);
    const third = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);
    await run(
      ["say", "--workspace=w", "--name=codex", "--to=claude", "--kind=directive", "--message=Reset count."],
      root
    );
    const actionable = await run(["poll", "--workspace=w", "--name=claude", "--wait=0"], root);

    expect(first.stdout).toContain("CONSECUTIVE EMPTY POLLS: 1");
    expect(second.stdout).toContain("CONSECUTIVE EMPTY POLLS: 2");
    expect(third.stdout).toContain("CONSECUTIVE EMPTY POLLS: 3");
    expect(actionable.stdout).toContain("CONSECUTIVE EMPTY POLLS: 0");
  });

  test("wait alias uses wait title and canonical wait command", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    const waited = await run(["wait", "--workspace=w", "--name=claude", "--wait=0"], root);

    expect(waited.stdout).toContain("# CODEWORK WAIT RESULT");
    expect(waited.stdout).toContain("RE-RUN EXACT COMMAND:\ncodework wait --workspace=w --name=claude --wait=0 --interval=2");
  });

  test("bounded long-poll receives an event posted during the poll window", async () => {
    const root = await tempRoot();

    await run(["new", "--workspace=w", "--name=codex", "--follow=user"], root);
    await run(["join", "--workspace=w", "--name=claude", "--follow=codex"], root);
    const pollPromise = run(["poll", "--workspace=w", "--name=claude", "--wait=2", "--interval=1"], root);
    setTimeout(() => {
      void run(
        ["say", "--workspace=w", "--name=codex", "--to=claude", "--kind=directive", "--message=Late directive."],
        root
      );
    }, 100);

    const poll = await pollPromise;
    expect(poll.stdout).toContain("POLL RESULT: actionable-events-found");
    expect(poll.stdout).toContain("Late directive.");
  });
});
