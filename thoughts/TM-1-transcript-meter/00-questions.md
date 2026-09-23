# 00 · Questions — TM-1 What agent sessions cost, from the transcripts


The default assumption is what makes this phase non-blocking: work can proceed
without waiting for answers, and the assumptions are on the record.

---

## Ticket

**ID:** TM-1
**Link:** https://github.com/Allan-Nava/transcriptmeter/blob/main/BACKLOG.md
**Title:** What agent sessions cost, from the transcripts

**Goal.** Claude Code and Codex CLI both write to disk everything needed to know what a
session cost: per-response `usage` with the cache split, the model, the tool results.
Until now every measurement (qrspi's token-efficiency skill, hookgate's and trimhook's
benchmarks) came from a throwaway twenty-line script over `~/.claude/projects`,
rewritten each time. `transcriptmeter` is one CLI that reads those transcripts back as
numbers — tokens by class, cache hit ratio, peak context, list-price cost, tool output
by command — for both harnesses, reporting sizes and identifiers only, with nothing
leaving the machine.

**Done when.**

- `npx transcriptmeter` prints the summary; subcommands `sessions` (table), `session`
  (one session), `tools` (tool-output breakdown), `prices` (dated price table);
  `--json` on all of them; filters by time, project, harness, subagents.
- Both readers (Claude Code, Codex CLI) follow the current field shapes, dated in
  `CLAUDE.md`, with fixtures in the repository that reproduce them; one Claude Code
  response is counted exactly once.
- Totals cross-checked once against the harnesses' own `/usage` and `/status`, with the
  differences explained in the README.
- `npm test` green on Node 18/20/22/24; release by tag over OIDC.

**In scope.** The two readers; KPIs peak context, tokens per session, cache hit ratio;
the cost estimate at dated list prices; cache-miss and model-switch counts; the tool
output breakdown with command prefixes; a QRSPI phase label per session.

**Constraints.**

- Zero dependencies, Node 18+, instant start; a month of transcripts (≈130 sessions,
  ≈80,000 lines) processed in a few seconds.
- Fixtures only in the repository; real transcripts never.
- Prices dated; README carries the date; `check` enforces the match.
- Never show message text or full commands; never send anything anywhere.

**Decisions already taken by the ticket (not to be reopened).**

- The unit of measurement is the session (QRSPI runs one session per phase).
- Claude Code responses are deduplicated by `requestId` — measured: without it totals
  come out 2–3× too high.
- An unpriced quantity prints as `—`, never as zero.
- Costs are list prices for an API key, labelled as such; subscription terms are unknown.

**Assumptions stated in the ticket.** Four characters per token for tool-result sizes,
labelled as an estimate. A "cache miss after a warm prefix" is a response whose prompt
exceeds 20k tokens, where the previous response's prompt was over half cached and this
one is under a tenth cached.

**Risks named in the ticket.** Format drift (both harnesses ship weekly; a renamed field
silently zeroes a column). Subscription users misreading "cost" as a bill. Sidechain and
subagent files double-counting a parent's turns if a harness ever writes them into the
parent's file — today they are separate `agent-*.jsonl` files.

---

## Questions

### Q1 · When several transcript lines share one `requestId`, which line's `usage` counts — and what about lines with no `requestId` at all?

- **Risk if unresolved:** The ticket's "counted once" criterion is only as good as the
  rule that picks the one record. A streamed response is written as several assistant
  lines (text, then tool_use blocks) that may each carry a `usage` object; if the
  reader sums them, totals are 2–3× high, and if it keeps the first it undercounts
  output tokens. Lines without a `requestId` (synthetic messages, API-error retries,
  older transcripts) either vanish or all collapse onto one key. Every KPI downstream —
  tokens per session, cost, cache hit ratio — inherits the error, and the cross-check
  against `/usage` cannot pass, so the "done when" gate fails for a reason that looks
  like a pricing bug.
- **Default assumption:** Keep the last line seen per `requestId` within one file (the
  final one carries the complete `usage` for that response). Lines with no `requestId`
  are keyed by their own message `id` or line index — one record each — and the reader
  reports how many such lines it saw so the number is visible rather than silent.
- **Answer:** _(to be filled — human)_

### Q2 · Are `agent-*.jsonl` subagent files their own sessions, rolled into their parent, or both — and which reading does the `subagents` filter switch?

- **Risk if unresolved:** Subagent files can be a large share of a run's spend (a
  research phase that fans out to Explore agents). If they are separate sessions the
  session count and per-session averages are diluted; if they are rolled into the
  parent, the parent's peak context is polluted with a child's prompt; if they are both,
  the summary total double-counts. The cross-check against `/usage` only works under
  one of these readings, and the "subagents" filter in the "done when" list has no
  defined meaning until this is settled.
- **Default assumption:** A subagent file is attributed to its parent session (matched
  by directory and the session id embedded in the file name or first line): tokens and
  cost roll up into the parent's totals, peak context is computed per file and the
  parent's own peak is what the session row shows. The `subagents` filter has three
  values — include (default), exclude, only. A subagent whose parent cannot be found is
  listed as its own session and flagged.
- **Answer:** _(to be filled — human)_

### Q3 · Where do Codex CLI transcripts live, and does its usage record carry per-response deltas, a cache split and a dedupe key — or cumulative totals only?

- **Risk if unresolved:** The ticket promises parity ("both readers") but every stated
  decision and measurement is about Claude Code. If Codex writes cumulative token
  counts per turn, a reader that treats them as deltas over-reports by orders of
  magnitude; if it carries no cache split the cache-hit-ratio column is `—` for half the
  data and the summary must say so; if there is no response id the "counted once" rule
  has no key. Research either finds this out early or Design ships a Codex reader that
  is wrong in a way the fixtures — written from the same misunderstanding — cannot
  catch.
- **Default assumption:** Codex sessions are JSONL under `~/.codex/sessions/`
  (date-partitioned), each turn emitting a token-count event with cumulative totals and
  a last-turn delta, with input / cached-input / output / reasoning fields; there is no
  `requestId`-like key, so each token-count event is one record. Fields not present
  print as `—`. Codex models are read for the model-switch count but not priced.
- **Answer:** _(to be filled — human)_

### Q4 · What exactly does the cost estimate charge for — which cache-write tier, which models, and what does a session with one unpriced response show?

- **Risk if unresolved:** The cost column is the number people will quote. Cache writes
  have two list prices (5-minute and 1-hour TTL) and the transcript may or may not say
  which was used; long-context surcharges exist above certain prompt sizes for some
  models; a session that mixes a priced main model with an unpriced subagent model must
  either print a partial total (understated, looks complete) or `—` (loses information).
  Pick wrong and the "$8,827 is not a bill" label protects against the wrong
  misreading — the number itself is off.
- **Default assumption:** Price per response = input × input price + cache-read ×
  cache-read price + cache-write × the 5-minute write price unless the usage record's
  cache-creation split says otherwise + output × output price; no long-context
  surcharge in v1, noted as a known omission. Models are matched by exact id, falling
  back to a family prefix. A session with any unpriced response shows the priced
  subtotal with a `≥` marker and the count of unpriced responses; the summary carries
  the same marker.
- **Answer:** _(to be filled — human)_

### Q5 · How are "peak context" and "model switch" defined — which usage fields make up a prompt, and does a subagent's model count as a switch?

- **Risk if unresolved:** Peak context is the KPI the qrspi skill's 40% rule is argued
  from; if transcriptmeter's definition differs from the one those numbers were measured
  with (e.g. counting output tokens, or omitting cache-creation tokens), the tool
  contradicts the documents it was built to support. "Model switch" without a
  definition either counts every haiku subagent call as a switch (noise on every
  session) or misses a mid-session `/model` change (the event it exists to catch).
- **Default assumption:** Prompt size of one response = `input_tokens` +
  `cache_creation_input_tokens` + `cache_read_input_tokens`; peak context is the
  maximum over the responses of one file, output excluded. A model switch is a change
  of model between two consecutive responses in the same file; subagent files are
  compared within themselves only, never against the parent.
- **Answer:** _(to be filled — human)_

### Q6 · What do `/usage` and `/status` actually expose that a total can be checked against, and what tolerance makes the cross-check "pass"?

- **Risk if unresolved:** The "done when" list makes the cross-check a gate. Claude
  Code's `/usage` shows plan utilisation as percentages of a rolling window, not token
  counts, and `/status` shows the live context of the current session only; Codex's
  equivalents differ again. If nothing directly comparable is exposed, the criterion is
  unverifiable and either gets silently dropped or satisfied by a hand-wave in the
  README — which is exactly where a 2× dedupe error would hide.
- **Default assumption:** The comparable quantity is the current session's context
  size: `/status` (or its Codex counterpart) read at the end of a fresh session versus
  transcriptmeter's last-response prompt size for the same session file. Agreement
  within 5% passes; the README records the two numbers, the date, the harness
  versions and each known source of difference (system prompt not in the transcript,
  tool definitions, autocompaction). Plan-utilisation percentages are declared not
  comparable and said so.
- **Answer:** _(to be filled — human)_

### Q7 · For the tool-output breakdown, how long is a "command prefix" and where is the privacy line — first word, first two, or a curated list per tool?

- **Risk if unresolved:** Too short a prefix (`git`, `npm`) hides the distinction the
  breakdown exists to show (`git log` vs `git diff`); too long a prefix starts carrying
  arguments — file paths, ticket ids, URLs — which is message content, and the ticket
  forbids showing full commands. Non-Bash tools (Read, Grep, MCP tools) have no
  "command" at all, so the grouping key must be defined for them too or they land in an
  "other" bucket that dominates the table.
- **Default assumption:** Group by tool name; for Bash, additionally by the first word,
  and by the first two words when the first is in a small curated list (`git`, `npm`,
  `gh`, `docker`, `kubectl`, `node`, `npx`). Pipes and `&&` chains keep only the first
  segment. Never print anything past the second word; MCP tools group by server and
  tool name. Sizes are result bytes and the 4-chars-per-token estimate, labelled.
- **Answer:** _(to be filled — human)_

### Q8 · How does a session get its QRSPI phase label — from the first user prompt, from `thoughts/` paths in tool calls, or both — and what does a non-QRSPI session show?

- **Risk if unresolved:** The label couples transcriptmeter to qrspi's prompt wording.
  If it is a regex over the first prompt, a rephrased `/qrspi:next` output or a session
  that starts with a greeting breaks it silently and phases drift into "unlabelled";
  if it reads the artifact path from tool calls it labels any session that merely
  *reads* a `thoughts/` file. Either way the per-phase comparisons the skill wants to
  make (Research vs Implement cost) are computed over mislabelled rows without any
  signal that they are.
- **Default assumption:** Label from the first user prompt, matching the phase names
  and the `thoughts/…/0N-` artifact path qrspi's `/qrspi:next` emits; the task
  id is captured when present. Sessions that match nothing show an empty label, and
  the summary reports the labelled/unlabelled split so drift is visible.
- **Answer:** _(to be filled — human)_

### Q9 · What is a "project" across the two harnesses, and which timestamp and timezone do the time filters use?

- **Risk if unresolved:** Claude Code keys transcripts by an encoded cwd slug under
  `~/.claude/projects/`; Codex records the cwd inside the session. If "project" means
  the slug for one and the path for the other, `--project` cannot select the same repo
  in both, and the harness comparison the tool exists for is impossible on one command
  line. A time filter applied to the session's first message versus every message
  gives different session sets at the window edges, and a UTC/local mismatch shifts a
  day's boundary by hours — small in total, confusing in a "last 24h" summary.
- **Default assumption:** Project = the decoded cwd path, matched as a case-sensitive
  substring, so `--project transcriptmeter` works in both harnesses. A session belongs
  to the window if its first message's timestamp does; `--since`/`--until` accept ISO
  dates and relative durations (`7d`, `24h`), interpreted in local time.
- **Answer:** _(to be filled — human)_

### Q10 · What are "the current field shapes" pinned to — which harness versions on which date — and how does the pre-tag check read real transcripts that must never enter the repository?

- **Risk if unresolved:** "Dated in `CLAUDE.md`" needs a baseline: the version of each
  harness whose output the fixtures imitate. Without it a fixture is a sample of
  unknown provenance and format drift is undetectable, because there is no statement of
  what it drifted from. The ticket names a "real-file keys check before each tag" as the
  only defence and simultaneously bans real transcripts from the repository; if the
  check is not specified as something that runs on the maintainer's machine against
  `~/.claude` and `~/.codex` and reports only key names, it either gets skipped or gets
  a redacted transcript committed "just this once".
- **Default assumption:** Baseline = the Claude Code and Codex CLI versions installed on
  the author's machine on 2026-09-23, recorded with the version string each transcript
  carries; fixtures are hand-written from those shapes with all content replaced by
  placeholders. The pre-tag check is a `check` mode that reads the local transcript
  directories, compares the set of field names per record type against the fixtures',
  prints only key names and counts, and is listed in CONTRIBUTING's release runbook
  rather than run in CI.
- **Answer:** _(to be filled — human)_

---

## Out of scope

Things the ticket might suggest but that we are **not** doing in this task:

- Sending anything off the machine: no telemetry, no upload, no remote price lookup at
  run time.
- Showing message text, full commands, file contents or tool arguments — only sizes,
  identifiers, tool names and command prefixes.
- Interpreting a subscription plan: no rate-limit windows, no plan-utilisation
  percentages, no "what you actually paid". Costs are list prices for an API key and
  say so.
- Pricing Codex models, until a citable price source exists.
- A GUI, TUI dashboard, web service, daemon or file watcher: one CLI, text and JSON.
- A finer unit than the session (per task, per ticket, per PR); the transcripts carry
  no definition of "task".
- Other harnesses (Cursor, Gemini CLI, Aider, OpenCode) or non-JSONL sources; the two
  readers are the scope.
- Reading the harnesses' own usage APIs or the provider's billing API — the transcript
  on disk is the only source.
- Long-context pricing surcharges and per-region price differences in v1 (noted as an
  omission in the price table, not implemented).
- Changing what qrspi's `scripts/measure-run.mjs` and `measure-context-cost.mjs` do;
  replacing them with transcriptmeter is a later ticket in that repository.
- Editing, repairing or rewriting transcripts; the tool is read-only.

---

## Status

- [x] Questions generated
- [ ] Reviewed by a human
- [ ] Answers collected (or assumptions explicitly accepted)

> Next phase: **Research**. The ticket is **not** passed to Research — only the
> questions and their answers.
