import { mkdtemp, readFile } from "node:fs/promises";
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
