# Changelog

All notable changes to transcriptmeter. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/). Items reference their `TM-n` backlog id.

## [Unreleased]

### Added
- Codex models are priced. The five ids Codex reports come from OpenAI's own pricing page,
  dated with the rest of the table, and each carries its own write multipliers because
  writing a cache entry is free there — inheriting Anthropic's 1.25×/2× would have
  overcharged it. `estimated cost` no longer says "unpriced models, tokens only" for a
  Codex session (TM-12).

## [0.2.0] — 2026-09-23

Three ways of reading the same transcripts that 0.1.0 did not have — a run, a week, and
the cause of every cache miss — and two counts that were wrong, one of which printed more
than this tool is allowed to print.

### Added
- `runs`: the sessions of one `thoughts/<task>` QRSPI run, grouped by phase and ending on
  the whole run — KPI 1 as the peak p50, KPI 3 as the run's tokens, KPI 4 as cache. The
  task id comes from the first prompt, which is reduced to that identifier and a phase
  name from a closed list; the prompt itself never reaches the output (TM-11).
- `weeks`: the same figures bucketed by the Monday they fall in, UTC, one row each —
  sessions, turns, tokens, cache hit ratio, peak p50, misses with the cause most of them
  were pinned on, and cost. A change in habits shows as a step where a monthly total
  hides it. Sessions that never reached the API are left out (TM-13).
- Every cache miss after a warm prefix is attributed to a cause — compaction, model
  switch, an entry past the TTL its write asked for, a tool the session had not used
  before, or unknown, which is counted rather than pinned on the nearest plausible one.
  The summary and `session` print the breakdown beside the count. On the author's machine
  222 of 278 misses are an expired entry: idle time, priced as a full re-read (TM-9).

### Fixed
- A shell command's prefix is a program name or `?`. It was the first word of whatever it
  was given, so a line continuation, a comment, a leftover `&&`, an opening brace or an
  absolute path took its place — 2,450 of 28,388 on the author's machine — and some of
  them printed a path out of the command, which the tool's first rule forbids. Paths are
  now cut to their last segment and a fragment is reported as `?` rather than printed
  (TM-18).
- A `user` entry written by the harness is recognised by its shape — one element, opening
  on a hyphenated tag and closing on it — instead of by a list of tag names that had
  already gone stale by the time it was written (TM-19).
- A compaction summary is a `user` entry with prose in it, written by the harness, and
  was counted as a human message — one per compaction (TM-9).

## [0.1.0] — 2026-09-23

Tagged, and not on the registry: the trusted publisher was not configured on npmjs.com
when its tag was pushed, so the publish could not authenticate. 0.2.0 supersedes it.

The first release worth installing. What changed since 0.0.1 is above all TM-8: the
numbers were compared against sources that are not this tool, and two of them were wrong.

### Added
- `--since` refuses a value it cannot read (exit 2) instead of silently dropping every
  session; the parser lives in `bin/lib/args.mjs` and is tested (TM-6).
- Edge tests: `--project`, `--cap`, `--prices` on an unpriced model, malformed lines,
  empty files, sessions without API turns, a root that does not exist (TM-6).

### Added
- Cross-checked the totals against sources that are not this tool and recorded both
  comparisons in the README: one session's peak context against the app's own context
  card (0.4% apart) and every Codex response against the `total_tokens` Codex writes
  itself (27 of 27 exact) (TM-8).

### Fixed
- A shell command's prefix is a program name or `?`. It was the first word of whatever it
  was given, so a line continuation, a comment, a leftover `&&`, an opening brace or an
  absolute path took its place — 2,450 of 28,388 on the author's machine — and some of
  them printed a path out of the command, which the tool's first rule forbids. Paths are
  now cut to their last segment and a fragment is reported as `?` rather than printed
  (TM-18).
- A `user` entry written by the harness is recognised by its shape — one element, opening
  on a hyphenated tag and closing on it — instead of by a list of tag names that had
  already gone stale by the time it was written (TM-19).
- **Human messages were never counted and a QRSPI phase was never recognised.** A human
  turn writes `message.content` as a plain string in a real transcript; the reader only
  read the block list the fixtures used, so `userMessages` was 0 for every real session
  and the phase prompt was never seen. The phase regex also matched only the skill
  template's exact words, which no person types. Both shapes are in the fixtures now
  (TM-8).
- A `user` entry written by the harness — `<task-notification>` and its siblings — is no
  longer counted as a human message (TM-8).
- Sessions that were opened and never reached the API are counted apart in the summary
  instead of sitting in the same figure as the sessions that cost something (TM-8).
- `tools --cap N` counted results over a hard-coded 8,000 characters and only changed the
  heading, so `--cap 2000` printed the 8,000 figure under a 2,000 heading; the cap is now
  applied while reading, and the line no longer calls every tool result a shell result.
  The JSON field is `overCap`, with the `cap` it was counted at beside it (TM-15).
- The Codex reader was chosen for any root with a `sessions` segment in its path, so a
  `CLAUDE_CONFIG_DIR` containing that word was read with the wrong reader; a `sessions`
  directory now has to be laid out by year (TM-16).
- An `assistant` entry whose `content` was not a block list lost its `usage` to a guard
  that ran before the accounting (TM-16).
- The p50 of an even number of sessions was the upper of the two middle values; the
  percentile is nearest-rank (TM-16).
- `test/make-fixtures.mjs` ran as part of `node --test` and rewrote the fixtures the
  tests were about to read, so the committed fixtures were never the ones under test.
  It is `scripts/make-fixtures.mjs` now, and CI regenerates and fails on a diff (TM-16).
- The site no longer carries hookgate's branding: the header wordmark and the `<title>`,
  Open Graph, Twitter and JSON-LD strings are derived from the README's H1 instead of the
  scaffolding they were copied from, so the headline is no longer printed twice; the
  eyebrow says CLI, not "Claude Code plugin"; the dead hooks inventory is gone; and the
  `og:image` is emitted only when `assets/social-preview.png` has been rendered from
  `assets/social-preview.html`, instead of pointing at a 404 (TM-14).
- Release notes told the reader to `/plugin install` transcriptmeter and to set
  `TYPESAFE_API_KEY`; they now say `npx transcriptmeter` (TM-14).

## [0.0.1] — 2026-09-23

Published to bootstrap the trusted publisher — npm will not configure one for a package
that does not exist — from the tree as it stood before TM-8. **Do not use it**: its
`userMessages` is 0 for every real session and it never recognises a QRSPI phase, because
it reads a human turn's `content` only as a block list. Both are fixed in 0.1.0.

### Added
- Readers for Claude Code transcripts (usage once per `requestId`, cache classes incl. the
  1 h write, tool results matched to tool uses, QRSPI phase, subagent flag, compactions)
  and Codex CLI sessions (`token_usage_record`, model from `world_state`, exec calls) (TM-2, TM-3).
- Metrics: tokens by class, cache hit ratio, misses after a warm prefix, model switches,
  peak context, list-price cost with a dated table and unpriced models named (TM-4).
- Commands `summary`, `sessions`, `session`, `tools`, `prices`, `check`; filters
  `--since`, `--project`, `--harness`, `--no-subagents`, `--roots`; `--json`; `--prices` (TM-5).
- Synthetic fixtures with the documented field shapes, tests, CI on Node 18/20/22/24 with
  a CLI smoke, release by tag over OIDC, site from the README, backlog with the issue sync (TM-6, TM-7).
