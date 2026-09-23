// The edges the first cut did not cover — written before the code that makes them pass.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { sinceMs } from '../bin/lib/args.mjs'
import { kindOf, loadSessions } from '../bin/lib/discover.mjs'
import { aggregate, sessionMetrics } from '../bin/lib/metrics.mjs'
import { renderSessions, renderSummary } from '../bin/lib/render.mjs'

const HERE = new URL('.', import.meta.url).pathname
const CLAUDE = join(HERE, 'fixtures', 'claude')
const CODEX = join(HERE, 'fixtures', 'codex')
const BIN = join(HERE, '..', 'bin', 'transcriptmeter.mjs')
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })

test('--since: relative units and dates parse, garbage is null and the CLI refuses it', () => {
  const now = Date.parse('2026-09-23T12:00:00Z')
  assert.equal(sinceMs('7d', now), now - 7 * 86400000)
  assert.equal(sinceMs('12h', now), now - 12 * 3600000)
  assert.equal(sinceMs('2w', now), now - 14 * 86400000)
  assert.equal(sinceMs('2026-09-01', now), Date.parse('2026-09-01'))
  assert.equal(sinceMs('yesterday', now), null)
  assert.equal(sinceMs(null, now), null)
  const r = run('--since', 'yesterday', '--roots', CLAUDE)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot read --since/)
})

test('--project filters on the working directory; --cap changes the over-cap count in tools', () => {
  const all = JSON.parse(run('sessions', '--json', '--roots', `${CLAUDE},${CODEX}`).stdout)
  const app = JSON.parse(run('sessions', '--json', '--project', '/dev/app', '--roots', `${CLAUDE},${CODEX}`).stdout)
  assert.equal(app.length, all.length, 'every fixture session lives under /Users/dev/app')
  assert.equal(JSON.parse(run('sessions', '--json', '--project', '/nowhere', '--roots', CLAUDE).stdout).length, 0)
  assert.match(run('tools', '--cap', '2000', '--roots', CLAUDE).stdout, /over 2,000 characters/)
})

test('--prices adds a table for an unpriced model and the summary stops calling it unpriced', () => {
  const d = mkdtempSync(join(tmpdir(), 'tm-'))
  const f = join(d, 'prices.json')
  writeFileSync(f, JSON.stringify({ 'claude-unknown-9': { input: 2, output: 8, read: 0.25 } }))
  const before = run('--roots', CLAUDE).stdout
  assert.match(before, /unpriced models, tokens only: claude-unknown-9/)
  const after = JSON.parse(run('--json', '--prices', f, '--roots', CLAUDE).stdout)
  assert.ok(after.cost > 0)
  assert.deepEqual(after.unpriced, [])
})

test('malformed lines, empty files and files without usage are skipped, never fatal', () => {
  const d = mkdtempSync(join(tmpdir(), 'tm-'))
  const proj = join(d, '-Users-x')
  mkdirSync(proj)
  writeFileSync(join(proj, 'empty.jsonl'), '')
  writeFileSync(join(proj, 'garbage.jsonl'), 'not json\n{"type":"assistant"}\n{"type":"assistant","message":{"role":"assistant","content":"a string, not an array"}}\n')
  writeFileSync(join(proj, 'notes-only.jsonl'), `${JSON.stringify({ type: 'summary', summary: 'x' })}\n`)
  writeFileSync(join(proj, 'one.jsonl'), `${JSON.stringify({ type: 'user', sessionId: 'u1', timestamp: '2026-09-23T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } })}\n`)
  assert.equal(kindOf(d), 'claude')
  const ss = loadSessions([d])
  assert.equal(ss.length, 1, 'only the file with a human message is a session')
  const m = sessionMetrics(ss[0])
  assert.equal(m.turns, 0)
  assert.equal(m.cacheHitRatio, null)
  assert.equal(m.cost, null)
  const a = aggregate([m])
  assert.equal(a.peakP50, null, 'a session without API turns has no peak')
  assert.equal(a.cost, null)
  assert.match(renderSummary(a), /1 sessions/)
  assert.match(renderSessions([m]), /—/)
  const r = run('--roots', d)
  assert.equal(r.status, 0)
})

test('a root that does not exist is simply empty', () => {
  const r = run('--json', '--roots', '/definitely/not/here')
  assert.equal(r.status, 0)
  assert.equal(JSON.parse(r.stdout).sessions, 0)
})
