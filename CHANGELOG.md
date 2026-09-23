# Changelog

All notable changes to transcriptmeter. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/). Items reference their `TM-n` backlog id.

## [Unreleased]

### Added
- `--since` refuses a value it cannot read (exit 2) instead of silently dropping every
  session; the parser lives in `bin/lib/args.mjs` and is tested (TM-6).
- Edge tests: `--project`, `--cap`, `--prices` on an unpriced model, malformed lines,
  empty files, sessions without API turns, a root that does not exist (TM-6).

### Fixed
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

Not published: the first working CLI, measured on one machine.

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
