# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

`transcriptmeter` is a **CLI**, not a plugin: `npx transcriptmeter` reads the transcripts
Claude Code and Codex CLI already write and prints what the sessions cost — tokens by
class, cache hit ratio, peak context, list-price cost, tool output by command. Nothing
leaves the machine; the output carries sizes and identifiers only. Zero dependencies,
Node 18+, same operating model as [qrspi](https://github.com/Allan-Nava/qrspi),
[hookgate](https://github.com/Allan-Nava/hookgate) and [trimhook](https://github.com/Allan-Nava/trimhook):
BACKLOG.md as the single source of truth, releases by tag, the same prose conventions.

`thoughts/TM-1-transcript-meter/00-brief.md` is the task definition.

## Layout

```
bin/transcriptmeter.mjs   the CLI: summary · sessions · session · tools · prices · check
bin/lib/readers/claude.mjs   ~/.claude/projects/<slug>/*.jsonl → one session object; usage
                          counted once per requestId; tool_result sizes matched to tool_use
bin/lib/readers/codex.mjs    ~/.codex/sessions/y/m/d/rollout-*.jsonl → the same shape;
                          token_usage_record per response, model from world_state/turn_context
bin/lib/readers/common.mjs   toolResultText, commandPrefix (first word or two, cd hops skipped)
bin/lib/discover.mjs      roots, discovery, which reader per root
bin/lib/args.mjs          the --since parser, pure and tested
bin/lib/metrics.mjs       sessionMetrics (KPIs, cost, misses, switches) and aggregate
bin/lib/prices.mjs        the dated list-price table; PRICES_DATE is load-bearing
bin/lib/render.mjs        the text output; --json bypasses it
test/                     node:test suites over the committed fixtures in test/fixtures/,
                          which carry the real field shapes and no real content
scripts/make-fixtures.mjs regenerates test/fixtures/; CI fails on a diff, so the
                          fixtures and their generator cannot drift apart
.github/workflows/        ci.yml (check + tests on Node 18/20/22/24, CLI smoke on fixtures, pack),
                          release.yml (tag transcriptmeter--v*: npm over OIDC, release, milestone),
                          release-drift.yml, pages.yml, codeql.yml, backlog-issues.yml
site/build.mjs            generates site/dist/index.html FROM README.md
assets/                   logo.svg (single source: favicon, header, hero, README),
                          logo-mono.svg, social-preview.html and the PNG rendered from it
                          with headless Chrome — the site emits og:image only if it exists
BACKLOG.md / ROADMAP.md   source of truth / generated view; scripts/backlog.mjs
```

## The rules the code encodes

1. **Sizes and identifiers only.** No message text, no file contents, no full command
   ever reaches the output or the JSON. `commandPrefix` is the only text derived from a
   command. A change that prints more than that is a bug, whatever it is for.
2. **Nothing leaves the machine.** No network. Ever.
3. **Count each API response once.** Claude Code writes one line per content block with
   the same `requestId` and the same `usage`; without deduplication every number is
   two to three times too large. Codex writes one `token_usage_record` per response.
4. **Every price carries a date.** `PRICES_DATE` in `bin/lib/prices.mjs`; the README must
   show the same date (`check` enforces it). A model not in the table is reported as
   unpriced, never guessed.
5. **Fixtures, not real transcripts, in tests.** `scripts/make-fixtures.mjs` builds them
   with the documented field shapes; a real transcript never enters the repository. The
   tests read the committed fixtures as they are — CI regenerates them and fails on a diff.
6. **Every number in the README is a run, dated**, and says whose machine.

## Facts the code depends on (dated — re-verify before every tag)

**Claude Code transcripts** (read off 40 local files, v2.1.280, 2026-09-23): entry fields
`type` (`user`, `assistant`, `attachment`, `summary`, …), `sessionId`, `timestamp`, `cwd`,
`version`, `isSidechain`, `requestId`, `isCompactSummary`; `message.model`,
`message.usage` with `input_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`, `output_tokens`, `cache_creation.{ephemeral_5m_input_tokens,
ephemeral_1h_input_tokens}`, `service_tier`, `speed`. Subagent transcripts are
`agent-*.jsonl` in the same project directory, `isSidechain: true`. `<synthetic>` is a
model value to ignore.

**Codex sessions** (0.155.1, 2026-09-23): `session_meta` (`session_id`, `cwd`, `cli_version`,
`model_provider`), `world_state.state.collaboration_mode.model`, `turn_context.model`,
`token_usage_record.payload.usage.{input_tokens, cached_input_tokens,
cache_write_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}` where
`input_tokens` is the whole prompt and `cached_input_tokens` the cached part;
`response_item` of type `custom_tool_call` (`name: "exec"`, `input` holding
`exec_command({cmd:"…"})`) and `custom_tool_call_output` (`output`).

**Prices** (platform.claude.com/docs/en/about-claude/pricing, 2026-09-23): in
`bin/lib/prices.mjs`; cache read 0.1× except Fable 5.1 / Mythos 5.1 0.025× and Opus 5.5
0.05×; writes 1.25× (5 min) and 2× (1 h).

## Verifying a change

```bash
npm test                                                   # check + node --test
node scripts/make-fixtures.mjs                             # after changing a fixture shape
node bin/transcriptmeter.mjs --roots test/fixtures/claude,test/fixtures/codex
node bin/transcriptmeter.mjs --since 7d                     # your own machine, sizes only
npm run backlog && npm run build:site
```

## Conventions

- BACKLOG.md first: every idea is a `TM-n` item; shipped items say `ver=`.
- CHANGELOG under `[Unreleased]` in the same pull request as the change.
- Prose: British-leaning spelling, em-dashes, no marketing filler, no decorative emoji.
- Zero runtime dependencies, Node 18+, no build step, no `postinstall`.
