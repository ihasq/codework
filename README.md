# Codework

Codework is a TypeScript CLI harness for coordinating multiple AI coding agents through stdout-as-context.

It does not run Codex, Claude Code, or Cursor CLI. Instead, each agent calls `codework` from its own shell-capable environment, and Codework returns a strict operational guide plus shared workspace state.

## Quick start

In the first agent terminal:

```bash
! codework
```

This creates a directory workspace and joins the first participant as the human-led leader.

In the second agent terminal, from the same directory:

```bash
! codework
```

This joins the second participant as a follower engineer of the earlier leader. If no directive is available yet, Codework will tell the agent to run `codework` again.

The default authority mode is `follow=user`. Self-led project ownership is never the default and must be requested explicitly.

## Short commands

```bash
! codework
! codework status
! codework say worker-2 "Implement the Todo UI and run npm run build."
! codework done "Reviewed worker-2 output; npm run build passed."
```

Long explicit commands remain supported:

```bash
! codework new workspace=my-workspace --name=codex --follow=user
! codework join --workspace=my-workspace --name=claude --follow=codex
! codework poll --workspace=my-workspace --name=claude --wait=30
```

## Directory workspaces

When `--workspace` is omitted, Codework uses the current git root or current directory as the workspace. Use `--workspace` only when you intentionally want to coordinate work outside the current directory or need a legacy named workspace.

`--workspace` also accepts paths:

```bash
! codework --workspace=/path/to/other/project
```

## Waiting for another agent

`codework` and `codework poll` are bounded long-poll commands for LLM agents.

If no actionable event arrives, Codework intentionally exits and tells the agent to run the same command again. This is by design: Codework stdout is injected into the agent's context, so the retry instruction must be visible to the model.

Example:

```bash
! codework
```

If no directive arrives, the output will include:

```text
MUST: Run the exact command below again.
RE-RUN EXACT COMMAND:
codework
```

Do not interpret an empty poll as task completion.

### Waiting-loop demo

Codex and Claude Code can join the same directory workspace with no long arguments:

```bash
# Codex pane
! codework

# Claude Code pane, same directory
! codework
```

Codex becomes `leader` with `follow=user`. Claude Code becomes `worker-2` with `follow=leader`. If no actionable event has arrived, Codework returns `WAIT CONTINUATION REQUIRED` and tells Claude Code to run `codework` again. Claude Code must keep repeating that exact command until a directive, question, blocker, or other actionable event appears.

Then Codex can post work:

```bash
! codework say worker-2 "Implement a Vite + React + TypeScript Todo app with add, toggle, delete, remaining count, localStorage persistence, and npm run build verification."
```

Claude Code's next `! codework` receives the directive and switches from waiting to handling the actionable event. After implementation:

```bash
! codework done "Implemented Todo app; npm run build passed."
```

Codex can run `! codework` to receive the completion report and review.

## Runtime support

Node.js:

```bash
npm run build
node dist/cli.js doctor
```

Deno:

```bash
deno run --allow-read --allow-write --allow-env --allow-run=git src/cli.ts doctor
```

Bun:

```bash
bun run src/cli.ts doctor
bun run src/cli.ts new workspace=my-workspace --name=bun --follow=user
```

## Notes for Japanese users

Codework の stdout は、そのまま LLM の次コンテキストに入る主成果物です。そのため既定の text 出力は短い成功メッセージではなく、エージェントが守るべき英語の運用命令を返します。

`workspace=my-workspace` と `--workspace=my-workspace` の両方を受け付けます。これは Codex / Claude Code などの shell escape 利用時の表記ゆれを吸収するための仕様です。
