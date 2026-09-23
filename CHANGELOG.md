# Changelog

All notable changes to transcriptmeter. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/). Items reference their `TM-n` backlog id.

## [Unreleased]

### Added
- `--since` refuses a value it cannot read (exit 2) instead of silently dropping every
  session; the parser lives in `bin/lib/args.mjs` and is tested (TM-6).
- Edge tests: `--project`, `--cap`, `--prices` on an unpriced model, malformed lines,
  empty files, sessions without API turns, a root that does not exist (TM-6).

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
