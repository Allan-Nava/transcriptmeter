import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { kindOf, loadSessions } from '../bin/lib/discover.mjs'
import { changelogFaults } from '../bin/lib/changelog.mjs'
import { aggregate, runs, sessionMetrics, weekOf, weekly } from '../bin/lib/metrics.mjs'
import { costOf, priceFor } from '../bin/lib/prices.mjs'
import { commandPrefix, isMachineTurn } from '../bin/lib/readers/common.mjs'
import { renderRuns, renderSession, renderSessions, renderSummary, renderTools, renderWeeks } from '../bin/lib/render.mjs'

const HERE = new URL('.', import.meta.url).pathname
const CLAUDE = join(HERE, 'fixtures', 'claude')
const CODEX = join(HERE, 'fixtures', 'codex')
const BIN = join(HERE, '..', 'bin', 'transcriptmeter.mjs')

test('prices: dated snapshots resolve, cache reads and writes are multiplied, unknown models are unpriced', () => {
  assert.equal(priceFor('claude-haiku-4-5-20251001').input, 1)
  assert.equal(priceFor('claude-opus-5-5').read, 0.05)
  assert.equal(priceFor('gpt-6-luna').output, 0.5, 'Codex models are priced since 2026-09-23')
  assert.equal(priceFor('gpt-6-luna', { 'gpt-6-luna': { input: 1, output: 2, read: 0.1 } }).output, 2, '--prices still wins')
  assert.equal(priceFor('gpt-7-not-yet'), null)
  // Anthropic charges to write a cache entry; OpenAI does not, and each row says so.
  const w = { input: 0, cacheRead: 0, write5m: 1e6, write1h: 0, output: 0 }
  assert.equal(costOf(w, priceFor('claude-opus-5')), 5 * 1.25)
  assert.equal(costOf(w, priceFor('gpt-5.6-terra')), 2)
  const c = costOf({ input: 1e6, cacheRead: 1e6, write5m: 1e6, write1h: 1e6, output: 1e6 }, priceFor('claude-opus-5'))
  assert.equal(c, 5 + 0.5 + 6.25 + 10 + 25)
  assert.equal(costOf({ input: 1 }, null), null)
})

test('commandPrefix keeps a first word or two and skips cd hops', () => {
  assert.equal(commandPrefix('cd /x && npm test -- --grep a'), 'npm test')
  assert.equal(commandPrefix('K=1 ssh host'), 'ssh')
  assert.equal(commandPrefix('git -C /x status'), 'git')
})

// 2,450 of 28,388 Bash prefixes on the author's machine were not a program name on
// 2026-09-23: continuations, comments, leftover operators, absolute paths — and some
// of them printed a path out of somebody's command, which rule 1 does not allow.
test('commandPrefix reaches the program past the noise, and says ? rather than guess', () => {
  assert.equal(commandPrefix('cd /x && \\\n  npm test'), 'npm test', 'a line continuation')
  assert.equal(commandPrefix('# what this does\nls -la'), 'ls', 'a comment line')
  assert.equal(commandPrefix('&& make build'), 'make build', 'a leftover operator')
  assert.equal(commandPrefix('{ echo a; }'), 'echo', 'a brace group')
  assert.equal(commandPrefix('/usr/bin/python3 docs/scripts/nav-lint.py'), 'python3 nav-lint.py', 'paths cut to their last segment')
  assert.equal(commandPrefix('docs/scripts/new-release.sh'), 'new-release.sh')
  assert.equal(commandPrefix('$S/token.txt)'), '?', 'a fragment is not a command')
  assert.equal(commandPrefix(''), '?')
})

// A list of tags is read off one machine on one day. This repository's own list had
// already drifted by the time it was written — <bash-input>, <local-command-caveat> and
// <create-pr-command> were missing — so the rule is the shape, not the name.
test('a machine turn is recognised by its shape, not by a list that goes stale', () => {
  assert.equal(isMachineTurn('<task-notification>\n<event>x</event>\n</task-notification>'), true)
  assert.equal(isMachineTurn('<some-future-tag>relayed</some-future-tag>'), true, 'a tag no list knows')
  assert.equal(isMachineTurn('<bash-input>ls</bash-input>'), true)
  assert.equal(isMachineTurn('rewrite this <div> the way I said'), false)
  assert.equal(isMachineTurn('<html>a page I pasted</html>'), false, 'no hyphen: not a harness tag')
  assert.equal(isMachineTurn('<system-reminder>cut off mid'), true, 'opens with a known tag')
  assert.equal(isMachineTurn(''), false)
})

test('the Claude Code reader: turns, cache classes, tools, commands, phase, subagent, unknown model', () => {
  const ss = loadSessions([CLAUDE])
  assert.equal(kindOf(CLAUDE), 'claude')
  const ms = ss.map((s) => sessionMetrics(s)).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
  assert.deepEqual(ms.map((m) => m.id), ['agent-1', 'sess-claude-1', 'sess-claude-2', 'sess-claude-3'])
  const s1 = ms[1]
  assert.equal(s1.turns, 3)
  assert.equal(s1.phase, 'Research')
  assert.equal(s1.input, 12000 + 3000 + 49000)
  assert.equal(s1.cacheRead, 42000)
  assert.equal(s1.write5m, 34000)
  assert.equal(s1.output, 1500)
  assert.equal(s1.peak, 49000)
  assert.equal(s1.modelSwitches, 1)
  assert.equal(s1.misses, 1, 'a warm prefix that came back uncached')
  assert.equal(s1.tools.Bash.chars, 12000)
  assert.equal(s1.tools.Read.chars, 3000)
  assert.equal(s1.overCap, 1)
  assert.equal(s1.commands['npm test'], 12000)
  assert.ok(s1.cost > 0)
  assert.equal(s1.userMessages, 2, 'the two people-written turns; the task notification is not one')
  assert.equal(ms[0].subagent, true)
  assert.equal(ms[2].cost, null, 'unknown model: tokens but no dollars')
  assert.equal(ms[2].write1h, 500)
})

test('the Codex reader: prompt split into cached and uncached, model from world_state, commands from exec calls', () => {
  assert.equal(kindOf(CODEX), 'codex')
  const [m] = loadSessions([CODEX]).map((s) => sessionMetrics(s))
  assert.equal(m.harness, 'codex')
  assert.equal(m.id, 'sess-codex-1')
  assert.equal(m.turns, 2)
  assert.equal(m.cacheRead, 30008)
  assert.equal(m.input, 3200 + 1000)
  assert.equal(m.peak, 20000)
  assert.deepEqual(m.models, ['gpt-6-luna'])
  assert.ok(m.cost > 0, 'priced from the vendor page, dated')
  assert.equal(m.commands['git log'], 9000)
  assert.equal(m.overCap, 1)
  assert.equal(m.userMessages, 1)
})

// Both shapes are in the wild: a real transcript writes a human turn's content as a
// plain string, the block list is what a synthetic one used. Reading only the list
// counted no human messages at all and never matched a phase prompt.
test('a human turn is read as a string or as blocks, and machine turns are not human', () => {
  const [s] = loadSessions([CLAUDE]).map((m) => sessionMetrics(m)).filter((m) => m.id === 'sess-claude-1')
  assert.equal(s.phase, 'Research', 'named in prose, not in the skill template\'s words')
  assert.equal(s.task, 'TM-1-transcript-meter', 'the id out of the thoughts/ path, not the prompt')
  assert.equal(s.userMessages, 2)
})

// The unit where "tokens per completed task" means anything: one QRSPI run, read down
// its phases. A session that named no task is not in a run at all.
test('runs: grouped by thoughts/<task>, ordered by phase, with the whole run on the last line', () => {
  const ms = loadSessions([CLAUDE, CODEX]).map((s) => sessionMetrics(s))
  const rs = runs(ms)
  assert.equal(rs.length, 1)
  assert.equal(rs[0].task, 'TM-1-transcript-meter')
  assert.deepEqual(rs[0].phases.map((p) => p.phase), ['Research'])
  assert.equal(rs[0].total.turns, 3)
  assert.match(renderRuns(rs), /## TM-1-transcript-meter/)
  assert.match(renderRuns(rs), /— whole run/)
  assert.match(renderRuns([]), /No session names a thoughts\/<task>/)
})

// Every miss is pinned on the thing that caused it, or on nothing — a guess would be
// worse than a gap. The fixture holds one of each, in one session.
test('a cache miss is attributed to its cause, and to unknown when there is none', () => {
  const [m] = loadSessions([CLAUDE]).map((s) => sessionMetrics(s)).filter((x) => x.id === 'sess-claude-3')
  assert.equal(m.misses, 5)
  assert.deepEqual(m.missCauses, { compaction: 1, 'model switch': 1, 'cache expired': 1, 'new tool': 1, unknown: 1 })
  assert.equal(m.compactions, 1)
  assert.equal(m.userMessages, 1, 'the compaction summary is not a person')
  assert.match(renderSession(m), /5 \(1 compaction · 1 model switch · 1 cache expired · 1 new tool · 1 unknown\)/)
})

test('aggregate and render', () => {
  const ms = loadSessions([CLAUDE, CODEX]).map((s) => sessionMetrics(s))
  const a = aggregate(ms)
  assert.equal(a.sessions, 5)
  assert.equal(a.subagents, 1)
  assert.deepEqual(a.harnesses, { claude: 4, codex: 1 })
  assert.deepEqual(a.unpriced.sort(), ['claude-unknown-9'])
  assert.equal(a.tokens.output, 1500 + 100 + 300 + 406 + 1100)
  assert.equal(a.misses, 6, 'one in sess-claude-1, five in sess-claude-3')
  assert.equal(a.missCauses['model switch'], 2)
  assert.equal(a.phases.Research, 1)
  const sum = renderSummary(a, { since: '7d' })
  assert.match(sum, /5 sessions since 7d/)
  assert.match(sum, /unpriced models, tokens only: claude-unknown-9/)
  assert.match(sum, /`npm test` 12,000/)
  assert.match(renderSessions(ms), /Research/)
  assert.match(renderSession(ms.find((m) => m.id === 'sess-claude-1')), /peak context 49,000/)
  assert.match(renderTools(a, 8000), /Tool results over 8,000 characters: 2/)
})

// The cap is applied while reading, not while printing: the count under the heading
// has to be the count for that heading. `--cap 2000` used to print the 8,000 figure.
test('--cap is the cap that is counted, not just the one printed', () => {
  const at = (cap) => aggregate(loadSessions([CLAUDE, CODEX], cap).map((s) => sessionMetrics(s)))
  assert.equal(at(8000).overCap, 2, 'the 12,000 and 9,000 character results')
  assert.equal(at(2000).overCap, 3, 'the 3,000 character one joins them')
  assert.equal(at(20000).overCap, 0)
  assert.match(renderTools(at(2000), 2000), /Tool results over 2,000 characters: 3/)
})

// A week that moves with the reader's timezone is not a week anybody can compare, so
// the boundary is Monday in UTC and the label is that Monday.
test('weeks: Monday in UTC, one row each, and nothing to trend is said rather than drawn', () => {
  assert.equal(weekOf(Date.parse('2026-09-23T13:00:00Z')), '2026-09-21', 'a Wednesday')
  assert.equal(weekOf(Date.parse('2026-09-21T00:00:00Z')), '2026-09-21', 'the Monday itself')
  assert.equal(weekOf(Date.parse('2026-09-20T23:59:59Z')), '2026-09-14', 'the Sunday before')

  const at = (day, over) => ({ turns: 1, end: Date.parse(`2026-09-${day}T12:00:00Z`), peak: 1000, misses: 0, missCauses: {}, models: [], cost: 1, tokens: 0, input: 0, cacheRead: 0, write5m: 0, write1h: 0, output: 0, total: 0, compactions: 0, modelSwitches: 0, overCap: over, tools: {}, commands: {}, harness: 'claude', subagent: false, phase: null })
  const weeks = weekly([at('23', 0), at('16', 0), at('22', 0), { ...at('15', 0), turns: 0 }])
  assert.deepEqual(weeks.map((w) => [w.week, w.sessions]), [['2026-09-14', 1], ['2026-09-21', 2]], 'oldest first; the session without turns is not trended')
  assert.match(renderWeeks(weeks), /2 weeks, 2026-09-14 to 2026-09-21/)
  assert.match(renderWeeks([]), /No week has a session that reached the API/)
})

// Three releases in one day described themselves wrongly and nothing caught it, because
// the only automated check was that the tag and package.json agree on a version.
test('changelogFaults: the newest section is the version, and a tag ships nothing unannounced', () => {
  const log = (unreleased, ...versions) => `# Changelog\n\n## [Unreleased]\n${unreleased}\n${versions.map((v) => `## [${v}] — 2026-09-23\n\nnotes\n`).join('\n')}`

  assert.deepEqual(changelogFaults(log('', '0.2.0', '0.1.0'), '0.2.0'), [])
  assert.match(changelogFaults(log('', '0.1.0'), '0.2.0')[0], /newest section is 0\.1\.0, but package\.json says 0\.2\.0/)
  assert.match(changelogFaults('# Changelog\n\n## [1.0.0]\n', '1.0.0')[0], /needs an \[Unreleased\] section/)
  assert.match(changelogFaults('# Changelog\n\n## [Unreleased]\n', '1.0.0')[0], /no released section/)

  // Ordinary development leaves entries under [Unreleased]; only a tag objects to them.
  const pending = log('\n### Added\n- a thing nobody announced\n', '0.2.0')
  assert.deepEqual(changelogFaults(pending, '0.2.0'), [])
  assert.match(changelogFaults(pending, '0.2.0', { release: true })[0], /at a tag they ship without being announced/)
  assert.deepEqual(changelogFaults(log('', '0.2.0'), '0.2.0', { release: true }), [])
})

test('CLI: summary, sessions, session, tools, --json, --since, --harness, --no-subagents, check', () => {
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args, '--roots', `${CLAUDE},${CODEX}`], { encoding: 'utf8' })
  const j = JSON.parse(run('--json').stdout)
  assert.equal(j.sessions, 5)
  assert.equal(JSON.parse(run('sessions', '--json', '--no-subagents').stdout).length, 4)
  assert.equal(JSON.parse(run('sessions', '--json', '--harness', 'codex').stdout).length, 1)
  assert.equal(JSON.parse(run('sessions', '--json', '--since', '2030-01-01').stdout).length, 0)
  assert.match(run('session', 'sess-codex-1').stdout, /codex session sess-codex-1/)
  assert.equal(run('session', 'nope').status, 1)
  assert.match(run('tools').stdout, /Top shell commands/)
  assert.equal(JSON.parse(run('runs', '--json').stdout).length, 1)
  const weeks = JSON.parse(run('weeks', '--json').stdout)
  assert.equal(weeks.length, 1, 'every fixture session lands in the same week')
  assert.equal(weeks[0].week, '2026-09-14')
  assert.match(run('weeks').stdout, /Weeks start on Monday, UTC/)
  const capped = JSON.parse(run('tools', '--cap', '2000', '--json').stdout)
  assert.deepEqual([capped.cap, capped.overCap], [2000, 3])
  const check = spawnSync(process.execPath, [BIN, 'check'], { encoding: 'utf8' })
  assert.match(check.stdout + check.stderr, /ok — two readers|✗/)
})
