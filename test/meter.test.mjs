import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { kindOf, loadSessions } from '../bin/lib/discover.mjs'
import { aggregate, sessionMetrics } from '../bin/lib/metrics.mjs'
import { costOf, priceFor } from '../bin/lib/prices.mjs'
import { commandPrefix } from '../bin/lib/readers/common.mjs'
import { renderSession, renderSessions, renderSummary, renderTools } from '../bin/lib/render.mjs'

const HERE = new URL('.', import.meta.url).pathname
const CLAUDE = join(HERE, 'fixtures', 'claude')
const CODEX = join(HERE, 'fixtures', 'codex')
const BIN = join(HERE, '..', 'bin', 'transcriptmeter.mjs')

test('prices: dated snapshots resolve, cache reads and writes are multiplied, unknown models are unpriced', () => {
  assert.equal(priceFor('claude-haiku-4-5-20251001').input, 1)
  assert.equal(priceFor('claude-opus-5-5').read, 0.05)
  assert.equal(priceFor('gpt-6-luna'), null)
  assert.equal(priceFor('gpt-6-luna', { 'gpt-6-luna': { input: 1, output: 2, read: 0.1 } }).output, 2)
  const c = costOf({ input: 1e6, cacheRead: 1e6, write5m: 1e6, write1h: 1e6, output: 1e6 }, priceFor('claude-opus-5'))
  assert.equal(c, 5 + 0.5 + 6.25 + 10 + 25)
  assert.equal(costOf({ input: 1 }, null), null)
})

test('commandPrefix keeps a first word or two and skips cd hops', () => {
  assert.equal(commandPrefix('cd /x && npm test -- --grep a'), 'npm test')
  assert.equal(commandPrefix('K=1 ssh host'), 'ssh')
  assert.equal(commandPrefix('git -C /x status'), 'git')
})

test('the Claude Code reader: turns, cache classes, tools, commands, phase, subagent, unknown model', () => {
  const ss = loadSessions([CLAUDE])
  assert.equal(kindOf(CLAUDE), 'claude')
  const ms = ss.map((s) => sessionMetrics(s)).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
  assert.deepEqual(ms.map((m) => m.id), ['agent-1', 'sess-claude-1', 'sess-claude-2'])
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
  assert.equal(s1.userMessages, 2)
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
  assert.equal(m.cost, null)
  assert.equal(m.commands['git log'], 9000)
  assert.equal(m.overCap, 1)
  assert.equal(m.userMessages, 1)
})

test('aggregate and render', () => {
  const ms = loadSessions([CLAUDE, CODEX]).map((s) => sessionMetrics(s))
  const a = aggregate(ms)
  assert.equal(a.sessions, 4)
  assert.equal(a.subagents, 1)
  assert.deepEqual(a.harnesses, { claude: 3, codex: 1 })
  assert.deepEqual(a.unpriced.sort(), ['claude-unknown-9', 'gpt-6-luna'])
  assert.equal(a.tokens.output, 1500 + 100 + 300 + 406)
  assert.equal(a.misses, 1)
  assert.equal(a.phases.Research, 1)
  const sum = renderSummary(a, { since: '7d' })
  assert.match(sum, /4 sessions since 7d/)
  assert.match(sum, /unpriced models, tokens only: claude-unknown-9, gpt-6-luna/)
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

test('CLI: summary, sessions, session, tools, --json, --since, --harness, --no-subagents, check', () => {
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args, '--roots', `${CLAUDE},${CODEX}`], { encoding: 'utf8' })
  const j = JSON.parse(run('--json').stdout)
  assert.equal(j.sessions, 4)
  assert.equal(JSON.parse(run('sessions', '--json', '--no-subagents').stdout).length, 3)
  assert.equal(JSON.parse(run('sessions', '--json', '--harness', 'codex').stdout).length, 1)
  assert.equal(JSON.parse(run('sessions', '--json', '--since', '2030-01-01').stdout).length, 0)
  assert.match(run('session', 'sess-codex-1').stdout, /codex session sess-codex-1/)
  assert.equal(run('session', 'nope').status, 1)
  assert.match(run('tools').stdout, /Top shell commands/)
  const capped = JSON.parse(run('tools', '--cap', '2000', '--json').stdout)
  assert.deepEqual([capped.cap, capped.overCap], [2000, 3])
  const check = spawnSync(process.execPath, [BIN, 'check'], { encoding: 'utf8' })
  assert.match(check.stdout + check.stderr, /ok — two readers|✗/)
})
