# Agent Instructions

Codework coordinates AI coding agents through append-only workspace events and stdout-as-context.

MUST: Keep stdout operational and explicit.
MUST: Preserve the `CODEWORK CONTEXT GUIDE` contract for LLM-facing commands.
MUST: Preserve `codework` zero-argument auto-enter as the shortest default coordination path.
MUST: Keep empty poll and empty auto-enter follower output explicit about continuing to wait.
MUST NOT: Add behavior that launches, drives, or controls external AI agent CLIs.
MUST NOT: add destructive repository automation to Codework without a separate guardrail design.
