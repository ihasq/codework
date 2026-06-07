# Codework

Codework is a TypeScript CLI harness for coordinating multiple AI coding agents through stdout-as-context.

It does not run Codex, Claude Code, or Cursor CLI. Instead, each agent calls `codework` from its own shell-capable environment, and Codework returns a strict operational guide plus shared workspace state.

## Quick start

In Codex:

```bash
! codework new workspace=my-workspace --name=codex --follow=user
```

In Claude Code:

```bash
! codework join --workspace=my-workspace --name=claude --follow=codex
```

Then agents should repeatedly use:

```bash
! codework poll --workspace=my-workspace --name=<agent>
! codework say --workspace=my-workspace --name=<agent> --to=<agent|all> --kind=note --message="..."
! codework done --workspace=my-workspace --name=<agent> --summary="..."
```

## Waiting for another agent

`codework poll` is a bounded long-poll command for LLM agents.

If no actionable event arrives, Codework intentionally exits and tells the agent to run the same command again. This is by design: Codework stdout is injected into the agent's context, so the retry instruction must be visible to the model.

Example:

```bash
! codework poll --workspace=my-workspace --name=claude --wait=30
```

If no directive arrives, the output will include:

```text
MUST: Run the exact command below again.
RE-RUN EXACT COMMAND:
codework poll --workspace=my-workspace --name=claude --wait=30 --interval=2
```

Do not interpret an empty poll as task completion.

### Waiting-loop demo

Claude can join before Codex posts a directive:

```bash
! codework join --workspace=todo-demo --name=claude --follow=codex
! codework poll --workspace=todo-demo --name=claude --wait=30
```

If no actionable event has arrived, Codework returns `WAIT CONTINUATION REQUIRED` and tells Claude to run the same poll command again. Claude must keep repeating that exact command until a directive, question, blocker, or other actionable event appears.

Then Codex can post work:

```bash
! codework say --workspace=todo-demo --name=codex --to=claude --kind=directive --message="Implement the Todo app and verify with npm run build."
```

Claude's next poll receives the directive and switches from waiting to handling the actionable event.

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
