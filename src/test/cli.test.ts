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
      if (/^(WORKSPACE|AGENT|FOLLOW|AUTHORITY MODE):/.test(line)) return true;
      if (line.startsWith("MUST:")) return true;
      if (line.startsWith("MUST NOT:")) return true;
      if (line.startsWith("CODEWORK REPORT:")) return true;
      if (line.startsWith("No unread events.")) return true;
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

    const firstPoll = await run(["poll", "--workspace=w", "--name=claude"], root);
    const secondPoll = await run(["poll", "--workspace=w", "--name=claude"], root);

    expect(firstPoll.code).toBe(0);
    expect(firstPoll.stdout).toContain("kind=directive");
    expect(firstPoll.stdout).toContain("Inspect tests.");
    expect(secondPoll.code).toBe(0);
    expect(secondPoll.stdout).toContain("No unread events.");
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
    const poll = await run(["poll", "--workspace=snap", "--name=claude"], root);
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
});
