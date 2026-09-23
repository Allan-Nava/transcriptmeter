<p align="center"><img src="https://raw.githubusercontent.com/Allan-Nava/transcriptmeter/main/assets/logo.svg" width="96" height="96" alt="transcriptmeter"></p>

# transcriptmeter — what your agent sessions cost, from the transcripts on your disk

Claude Code writes every session to `~/.claude/projects/<project>/<session>.jsonl` with the
API's `usage` on every response; Codex CLI writes `~/.codex/sessions/…/rollout-*.jsonl` with
a `token_usage_record` per response. Everything you need to know about what a session cost
is already there — tokens by class, how much of the prompt came from cache, how big the
context got, what the tools returned. transcriptmeter reads it back as numbers. Nothing
leaves the machine; it keeps **sizes and identifiers only** and never shows message text
or a command beyond its first word or two.

```
npx transcriptmeter                  # totals across sessions, both harnesses
npx transcriptmeter sessions --since 7d
npx transcriptmeter session <file or id>
npx transcriptmeter tools --cap 8000
npx transcriptmeter prices           # the list-price table and its date
```

> **Status: working, measured on one machine, not yet released.** The readers follow the
> field shapes of Claude Code 2.1.280 and Codex CLI 0.155.1 as read on 2026-09-23. The
> deduplication rule that makes the Claude Code numbers right — one API response is
> written as several lines with the same `requestId` — is the kind of fact this tool
> depends on; `CLAUDE.md` lists them all with their dates.

## What it reports

| Number | From | Why it matters |
|---|---|---|
| Tokens by class: uncached input, cache read, cache write (5 min and 1 h), output | `usage` on each response, counted once per `requestId` | the sum is what you paid for; the split says whether caching worked |
| **Cache hit ratio** — cache read over the whole prompt | same | KPI 4 of the `token-efficiency` skill: over 70% in an implement session, or something in the prefix is moving |
| Cache misses after a warm prefix, model switches, compactions | consecutive responses, `message.model`, `isCompactSummary` | the three things that rebuild the cache; each miss is one full re-read at input price |
| **Peak context** per session, p50 and p95 across sessions | max prompt size over the session | KPI 1: the 40% rule is about this number |
| Estimated cost at list prices, dated | the price table in `bin/lib/prices.mjs` | what the session would bill on an API key; on a subscription it is the size of what the plan absorbed |
| Tool results by tool, shell results by command prefix, results over a cap | `tool_result` sizes matched to `tool_use` | where the context went; the input to a trimming policy such as [trimhook](https://github.com/Allan-Nava/trimhook) |
| QRSPI phase, when the first prompt names one | the phase prompt's own words | one session per phase means one row per phase — the run's KPIs read straight off the table |

Unpriced models — every Codex model today — get tokens and a `—` in the cost column, and
the summary names them. `--prices <file.json>` adds your own `{ "model": { "input", "output", "read" } }`.

## One machine, one month

Run on 2026-09-23 over the author's own transcripts, `--since 30d --no-subagents`, sizes
only. Not a benchmark of anything but this tool's own output:

```
## 127 sessions since 30d · claude 119, codex 8 · 29,608 API turns
tokens: 11,942,868,953 total — uncached input 136,473 · cache read 11,700,665,035 · cache write 210,999,425 (210,999,425 at 1h) · output 31,068,020
cache hit ratio 98% · cache misses after a warm prefix 277 · model switches 8 · compactions 35
peak context per session: p50 101,407 · p95 965,951 tokens
estimated cost $8827.27 at list prices of 2026-09-23 — unpriced models, tokens only: gpt-5.6-terra, gpt-6-luna
tool results: 26,847,716 characters (≈ 6,711,929 tokens) · 324 results over 8,000 characters · by tool: Bash 24,195,808 · WebFetch 1,073,190 · Read 1,058,862
```

Three things that table says at a glance and no dashboard did: 98% of every prompt token
was a cache read, so the 277 misses are where the money went; half the sessions peaked
above 100k tokens of context and one in twenty above 960k; and shell output is 90% of
what the tools ever returned. Every one of those is a decision — which misses, which
sessions, which commands — and `sessions`, `session` and `tools` are the drill-downs.

## Install

```
npx transcriptmeter            # no install
npm i -g transcriptmeter       # or keep it
```

Zero dependencies, Node 18 or later. Reads `~/.claude/projects` and `~/.codex/sessions`
(`CLAUDE_CONFIG_DIR` and `CODEX_HOME` respected); `--roots a,b` reads elsewhere, which
is how the tests and CI run it against fixtures.

## What it does not do

- Send anything anywhere, or read message text into its output. The only text it keeps is
  a shell command's first word or two and a QRSPI phase name.
- Know your subscription. Costs are list prices for an API key, dated; on a plan they
  measure the plan's usage, not a bill.
- Put a number on a session that used an unpriced model. One unpriced response and the
  whole session's cost is `—`: a partial total would read as the total. The tokens are
  still counted, and the summary names the models it could not price.
- Price Codex models: no public table this tool can cite yet. Tokens are reported.
- Reconstruct a "task": the unit is the session. With one session per QRSPI phase that is
  exactly the unit you want; in a long free-form session it is not.

## Prior art

- [qrspi](https://github.com/Allan-Nava/qrspi): the `token-efficiency` skill defines the
  KPIs this tool prints, and `scripts/measure-run.mjs` was the first cut of the Claude Code
  reader. This is that script, grown up and given the Codex format.
- [hookgate](https://github.com/Allan-Nava/hookgate) and [trimhook](https://github.com/Allan-Nava/trimhook):
  sibling plugins whose benchmarks read the same transcripts; their ad-hoc counting scripts
  are what this tool replaces.

## License

MIT.
