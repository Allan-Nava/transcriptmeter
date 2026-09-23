# TM-1 — Brief: what agent sessions cost, from the transcripts

**Repository:** https://github.com/Allan-Nava/transcriptmeter · **Ticket:** TM-1 in `BACKLOG.md`
**Date:** 2026-09-23 · **Author:** Allan Nava, with Claude

## Goal

Every measurement behind qrspi's token-efficiency skill, hookgate's and trimhook's
benchmarks was made with a twenty-line script over `~/.claude/projects`, rewritten each
time. Claude Code and Codex CLI already write, on disk, everything needed to know what a
session cost: `usage` per response with the cache split, the model, the tool results.
transcriptmeter reads it back as numbers — tokens by class, cache hit ratio, peak
context, list-price cost, tool output by command — for both harnesses, with sizes and
identifiers only, and nothing leaving the machine.

## Done when

- `npx transcriptmeter` prints the summary, `sessions` the table, `session` one session,
  `tools` the output breakdown, `prices` the dated table; `--json` for all; filters by
  time, project, harness, subagents.
- Both readers follow the current field shapes, dated in `CLAUDE.md`, with fixtures that
  reproduce them; one Claude Code response is counted once.
- Totals cross-checked once against the harnesses' own `/usage` and `/status`, the
  differences explained in the README.
- `npm test` green on Node 18/20/22/24; release by tag over OIDC.

## In scope

- The two readers, the KPIs (peak context, tokens per session, cache hit ratio), the
  cost estimate at dated list prices, the cache-miss and model-switch counts, the tool
  output breakdown with command prefixes, the QRSPI phase label.

## Out of scope

- Sending anything anywhere; showing message text or full commands.
- Knowing a subscription's terms: costs are list prices for an API key, labelled so.
- Pricing Codex models until a citable source exists.
- A GUI or a service: one CLI, text and JSON.

## Constraints

- Zero dependencies, Node 18+, instant start; a month of transcripts (≈ 130 sessions,
  ≈ 80,000 lines) in a few seconds.
- Fixtures only in the repository; real transcripts never.
- Prices dated; the README carries the date; `check` enforces the match.

## Decisions taken

- **The unit is the session.** With QRSPI's one session per phase that is the unit
  wanted; anything finer needs a definition of "task" the transcripts do not carry.
- **Dedupe by `requestId`.** Measured: without it Claude Code totals are 2–3× too high.
- **Unpriced means `—`, not zero.**

## Assumptions (proceeding this way unless corrected)

- Four characters per token for tool-result sizes, labelled as an estimate.
- A "cache miss after a warm prefix" is a response with a prompt over 20k tokens where
  the previous response's prompt was over half cached and this one under a tenth.

## Open risks

- **Format drift.** Both harnesses ship weekly; a renamed field silently zeroes a
  column. The fixtures pin today's shape; a real-file keys check before each tag is
  the only defence.
- **Subscription readers misreading "cost".** $8,827 at list prices for one month on a
  plan is not a bill; the label must be impossible to miss.
- **Sidechain and subagent files** may double-count a parent's turns if a harness ever
  writes them into the parent's file; today they are separate `agent-*.jsonl` files.
