# Agent Instructions

Codework coordinates AI coding agents through append-only workspace events and stdout-as-context.

MUST: Keep stdout operational and explicit.
MUST: Preserve the `CODEWORK CONTEXT GUIDE` contract for LLM-facing commands.
MUST NOT: Add behavior that launches, drives, or controls external AI agent CLIs.
MUST NOT: add destructive repository automation to Codework without a separate guardrail design.
