<p align="center"><img src="https://raw.githubusercontent.com/Allan-Nava/transcriptmeter/main/assets/logo.svg" width="96" height="96" alt="transcriptmeter"></p>

<p align="center"><a href="https://www.npmjs.com/package/transcriptmeter"><img src="https://img.shields.io/npm/v/transcriptmeter?color=7a4b8c&amp;label=npm" alt="npm"></a> <a href="https://github.com/Allan-Nava/transcriptmeter/actions/workflows/ci.yml"><img src="https://github.com/Allan-Nava/transcriptmeter/actions/workflows/ci.yml/badge.svg" alt="CI"></a> <a href="https://github.com/Allan-Nava/transcriptmeter/actions/workflows/release.yml"><img src="https://github.com/Allan-Nava/transcriptmeter/actions/workflows/release.yml/badge.svg" alt="Release"></a> <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/transcriptmeter?color=7a4b8c&amp;label=node" alt="node"></a> <a href="LICENSE"><img src="https://img.shields.io/npm/l/transcriptmeter?color=7a4b8c" alt="MIT"></a></p>

# transcriptmeter — what your agent sessions cost, from the transcripts on your disk

Claude Code writes every session to `~/.claude/projects/<project>/<session>.jsonl` with the
API's `usage` on every response; Codex CLI writes `~/.codex/sessions/…/rollout-*.jsonl` with
a `token_usage_record` per response. Everything you need to know about what a session cost
is already there — tokens by class, how much of the prompt came from cache, how big the
context got, what the tools returned. transcriptmeter reads it back as numbers. Nothing
leaves the machine; it keeps **sizes and identifiers only** and never shows message text
or a command beyond its first word or two.

```
npx transcriptmeter                       # totals across sessions, both harnesses
npx transcriptmeter sessions --since 7d   # one row per session
npx transcriptmeter session <file or id>  # one session in detail
npx transcriptmeter tools --cap 8000      # what the tools returned, by tool and command
npx transcriptmeter runs                  # one table per thoughts/<task> run, by phase
npx transcriptmeter weeks --since 8w      # one row per week
npx transcriptmeter prices                # the list-price table and its date
```

> **Status: 0.2.0, on npm, measured and cross-checked on one machine.** The readers follow the
> field shapes of Claude Code 2.1.280 and Codex CLI 0.155.1 as read on 2026-09-23. The
> deduplication rule that makes the Claude Code numbers right — one API response is
> written as several lines with the same `requestId` — is the kind of fact this tool
> depends on; `CLAUDE.md` lists them all with their dates.

## What it reports

| Number | From | Why it matters |
|---|---|---|
| Tokens by class: uncached input, cache read, cache write (5 min and 1 h), output | `usage` on each response, counted once per `requestId` | the sum is what you paid for; the split says whether caching worked |
| **Cache hit ratio** — cache read over the whole prompt | same | KPI 4 of the `token-efficiency` skill: over 70% in an implement session, or something in the prefix is moving |
| Cache misses after a warm prefix, **each one attributed to its cause** — compaction, model switch, cache expired, new tool, or honestly unknown | consecutive responses, `message.model`, `isCompactSummary`, the gap against the TTL the write asked for | each miss is one full re-read at input price; the cause is what you would change |
| **Peak context** per session, p50 and p95 across sessions | max prompt size over the session | KPI 1: the 40% rule is about this number |
| Estimated cost at list prices, dated — Anthropic and OpenAI models both | the price table in `bin/lib/prices.mjs`, read off each vendor's own page on the date it carries | what the session would bill on an API key; on a subscription it is the size of what the plan absorbed |
| Tool results by tool, shell results by command prefix, results over a cap | `tool_result` sizes matched to `tool_use` | where the context went; the input to a trimming policy such as [trimhook](https://github.com/Allan-Nava/trimhook) |
| The same figures per week, one row each | the session's own end date, bucketed by the Monday in UTC | a change in habits shows as a step; a monthly total hides it |
| QRSPI phase and `thoughts/<task>`, when the first prompt names them | the first prompt, reduced to a phase name from a closed list and a task id | one session per phase means one row per phase, and `runs` gives the whole task's KPIs |

A model the table does not carry gets tokens and a `—` in the cost column, and the summary
names it. `--prices <file.json>` adds your own `{ "model": { "input", "output", "read" } }`,
which also overrides a row that ships.

## One machine, one month

Run on 2026-09-23 over the author's own transcripts, `--since 30d --no-subagents`, sizes
only. Not a benchmark of anything but this tool's own output:

```
## 1,750 sessions since 30d · claude 1,738, codex 12 · 30,151 API turns · 1,616 opened and never reached the API
tokens: 12,119,278,811 total — uncached input 183,337 · cache read 11,874,122,433 · cache write 213,390,424 (213,390,424 at 1h) · output 31,582,617
cache hit ratio 98% · cache misses after a warm prefix 279 (3 compaction · 3 model switch · 223 cache expired · 2 new tool · 48 unknown) · model switches 8 · compactions 36
peak context per session: p50 97,253 · p95 965,951 tokens
estimated cost $8947.52 at list prices of 2026-09-23
tool results: 27,405,623 characters (≈ 6,851,406 tokens) · 336 results over 8,000 characters · by tool: Bash 24,729,658 · WebFetch 1,073,756 · Read 1,060,871 · Edit 198,450 · Write 97,888 · Agent 54,284
top shell commands by result size: `sed` 4,571,619 · `echo` 3,164,530 · `grep` 2,563,592 · `python3` 2,560,783 · `cat` 1,979,832 · `for` 1,187,037 · `ssh` 839,013 · `ls` 802,111
QRSPI phases seen: Questions 80 · Structure 20
```

Three things that table says at a glance and no dashboard did: 98% of every prompt token
was a cache read, so the 278 misses are where the money went — and **222 of them are an
entry that simply expired**, not a compaction and not a model switch, on a machine whose
every cache write already asks for the one-hour TTL. That is idle time, priced: come back
to a session an hour later and the whole prefix is re-read at input price. Half the
sessions that reached the API peaked above 97k tokens of context and one in twenty above
960k; and shell output is 90% of what the tools ever returned.

The 1,616 files that never reached the API are sessions opened and abandoned; they cost
nothing and carry no KPI, so they are counted apart rather than mixed into the p50.

## Cross-checked

A tool that counts tokens is worth what its worst assumption is worth. Two of them were
wrong until 2026-09-23, and both were found by checking the numbers against a source that
is not this tool:

| What | Against | Result |
|---|---|---|
| Peak context of one Claude Code session | the app's own context card for that session, read at the same moment | 241,601 vs 240,696 — **0.4%**, one turn's worth |
| Every Codex response's prompt and output | `total_tokens`, which Codex writes itself and `/status` sums | **27 of 27 exact**, across 12 sessions |
| Human messages per session | counting them by hand in one session | 0 vs 8 — **wrong**, see below |
| QRSPI phase of a session | 125 first prompts that name a phase | 0 recognised — **wrong**, see below |

The last two were the same class of mistake. A human turn writes `message.content` as a
plain **string** in a real transcript; the fixtures used the block list, so the reader
counted no human messages at all and never saw a phase prompt. And the phase regex
matched the skill template's exact words, `You are in the **Questions** phase`, which no
person types — they write "run the questions phase". Both are fixed, both are in the
fixtures now, and the tests would have caught neither, because the tests read the
fixtures and the fixtures encoded the assumption.

What is still unchecked: the **cost** figure against what the harness itself reports for
the same session (Claude Code's `/cost`, Codex's `/status`). Both are interactive, so the
comparison needs a person to run them and paste two numbers — TM-17.

## One run, by phase

The session is the unit this tool can see. A **task** is not — unless the work was run
as QRSPI phases, one session each, and the first prompt says which `thoughts/<task>` it
belongs to. Then `runs` reads the whole thing down:

```
## HG-1-jev-gates
│ phase       │ sessions │ turns │ peak p50 │ cache │ tokens    │ output │ cost   │
├─────────────┼──────────┼───────┼──────────┼───────┼───────────┼────────┼────────┤
│ Questions   │ 1        │ 3     │ 67,191   │ 63%   │ 182,095   │ 1,204  │ $0.93  │
│ Research    │ 1        │ 9     │ 129,012  │ 84%   │ 791,334   │ 1,639  │ $1.86  │
│ Design      │ 2        │ 29    │ 113,703  │ 91%   │ 2,596,905 │ 1,946  │ $3.71  │
│ Structure   │ 1        │ 3     │ 79,218   │ 61%   │ 203,738   │ 521    │ $1.05  │
│ Plan        │ 1        │ 16    │ 207,544  │ 91%   │ 2,030,867 │ 1,320  │ $2.70  │
│ Implement   │ 5        │ 44    │ 74,022   │ 92%   │ 2,905,294 │ 5,762  │ $3.73  │
│ —           │ 3        │ 13    │ 133,072  │ 54%   │ 1,138,204 │ 2,995  │ $6.89  │
│ — whole run │ 14       │ 117   │ 79,218   │ 85%   │ 9,848,437 │ 15,387 │ $20.86 │
```

That last line is KPI 3, tokens per completed task, for the only unit where the question
has an answer. Sessions of the run whose first prompt named no phase sort last, under `—`.

## A change in habits, as a step

`weeks` is the same numbers bucketed by the Monday they fall in, UTC. Same machine, same
day, `--since 8w --no-subagents`:

```
## 8 weeks, 2026-08-03 to 2026-09-21
│ week       │ sessions │ turns  │ tokens        │ cache │ peak p50 │ misses │ mostly        │ cost     │
├────────────┼──────────┼────────┼───────────────┼───────┼──────────┼────────┼───────────────┼──────────┤
│ 2026-08-03 │ 7        │ 1,418  │ 641,980,288   │ 96%   │ 122,021  │ 40     │ unknown       │ $604.62  │
│ 2026-08-10 │ 7        │ 1,606  │ 576,222,082   │ 97%   │ 341,727  │ 25     │ unknown       │ $494.33  │
│ 2026-08-17 │ 2        │ 206    │ 31,217,132    │ 98%   │ 231,631  │ 0      │ —             │ $29.06   │
│ 2026-08-24 │ 2        │ 480    │ 129,816,838   │ 99%   │ 243,585  │ 2      │ cache expired │ $92.19   │
│ 2026-08-31 │ 30       │ 4,021  │ 1,061,803,880 │ 97%   │ 200,363  │ 37     │ cache expired │ $947.42  │
│ 2026-09-07 │ 29       │ 10,383 │ 4,420,623,549 │ 98%   │ 159,279  │ 105    │ cache expired │ $3269.03 │
│ 2026-09-14 │ 21       │ 969    │ 253,710,473   │ 97%   │ 66,907   │ 9      │ cache expired │ $245.38  │
│ 2026-09-21 │ 52       │ 14,112 │ 6,192,890,983 │ 98%   │ 49,474   │ 126    │ cache expired │ $4355.87 │

Weeks start on Monday, UTC. Sessions that never reached the API are left out.
```

The p50 of the peak context falls from 341,727 in the second week to 49,474 in the last
while the turns go up tenfold — that is a working habit changing, and it is the kind of
thing a total for the month hides completely. The `mostly` column is the cause most of
that week's misses were pinned on.

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
