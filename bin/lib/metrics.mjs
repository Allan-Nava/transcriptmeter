// From sessions to numbers. The five KPIs the qrspi token-efficiency skill names:
// 1 peak context, 3 tokens per completed task (here: per session), 4 cache hit ratio,
// plus what the tools returned and what it all cost.
import { costOf, priceFor } from './prices.mjs'

// A cache entry lives five minutes, or an hour when it was written with the 1 h TTL.
const TTL_5M = 5 * 60 * 1000
const TTL_1H = 60 * 60 * 1000

// Why a warm prefix came back cold. Asked in this order because the earlier ones
// rewrite more of the prompt: a compaction replaces it, a different model cannot read
// the other's cache, an expired entry is simply gone, and a tool the session had not
// used before is the visible half of a tool-set change. `unknown` is counted rather
// than assigned to the nearest plausible cause — a guess would be worse than a gap.
export const MISS_CAUSES = ['compaction', 'model switch', 'cache expired', 'new tool', 'unknown']

function causeOf(prev, t, compactionsAt) {
  if (prev.t !== null && t.t !== null && compactionsAt.some((at) => at > prev.t && at <= t.t)) return 'compaction'
  if (prev.model && t.model && prev.model !== t.model) return 'model switch'
  const ttl = prev.write1h > 0 ? TTL_1H : TTL_5M
  if (prev.t !== null && t.t !== null && t.t - prev.t > ttl) return 'cache expired'
  if (prev.newTool || t.newTool) return 'new tool'
  return 'unknown'
}

export function sessionMetrics(s, custom = {}) {
  let input = 0
  let cacheRead = 0
  let write5m = 0
  let write1h = 0
  let output = 0
  let peak = 0
  let cost = 0
  let priced = true
  let misses = 0
  let modelSwitches = 0
  let prev = null
  const missCauses = Object.fromEntries(MISS_CAUSES.map((c) => [c, 0]))
  const compactionsAt = s.compactionsAt ?? []
  for (const t of s.turns) {
    input += t.input
    cacheRead += t.cacheRead
    write5m += t.write5m
    write1h += t.write1h
    output += t.output
    const prompt = t.input + t.cacheRead + t.write5m + t.write1h
    if (prompt > peak) peak = prompt
    const c = costOf(t, priceFor(t.model, custom))
    if (c === null) priced = false
    else cost += c
    // A miss: a prompt that had been mostly cached comes back mostly uncached.
    if (prev && prev.prompt > 20000 && prev.cacheRead / prev.prompt > 0.5 && prompt > 20000 && t.cacheRead / prompt < 0.1) {
      misses++
      missCauses[causeOf(prev, t, compactionsAt)]++
    }
    if (prev && prev.model && t.model && prev.model !== t.model) modelSwitches++
    prev = { prompt, cacheRead: t.cacheRead, model: t.model, t: Number.isNaN(t.t) ? null : (t.t ?? null), write1h: t.write1h, newTool: t.newTool === true }
  }
  const promptTotal = input + cacheRead + write5m + write1h
  const toolChars = Object.values(s.tools).reduce((a, t) => a + t.chars, 0)
  return {
    harness: s.harness,
    id: s.id,
    file: s.file,
    project: s.project,
    subagent: s.subagent,
    phase: s.phase,
    task: s.task ?? null,
    start: s.start,
    end: s.end,
    minutes: s.start && s.end ? (s.end - s.start) / 60000 : null,
    models: Object.keys(s.models),
    turns: s.turns.length,
    userMessages: s.userMessages,
    compactions: s.compactions,
    input,
    cacheRead,
    write5m,
    write1h,
    output,
    promptTotal,
    total: promptTotal + output,
    peak,
    cacheHitRatio: promptTotal ? cacheRead / promptTotal : null,
    misses,
    missCauses,
    modelSwitches,
    cost: priced && s.turns.length ? cost : null,
    toolChars,
    tools: s.tools,
    commands: s.commands,
    overCap: s.overCap,
  }
}

// Nearest-rank: the smallest value at or above the p-th of the sorted sample, so the
// p50 of two sessions is the lower of the two rather than the higher.
const q = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.max(0, Math.ceil(p * xs.length) - 1))] : null)

// A QRSPI run goes through its phases in this order, and a run's table reads in it.
// A session of the run whose first prompt named no phase sorts last.
export const PHASE_ORDER = ['Questions', 'Research', 'Design', 'Structure', 'Plan', 'Implement']

// One row per (task, phase): the unit qrspi's own measure-run.mjs reports, which is the
// only unit where "tokens per completed task" — KPI 3 — means anything. A free-form
// session is not a task, and a session that named no `thoughts/<id>` is not in a run.
export function runs(ms) {
  const byTask = new Map()
  for (const m of ms) {
    if (!m.task || !m.turns) continue
    if (!byTask.has(m.task)) byTask.set(m.task, new Map())
    const phases = byTask.get(m.task)
    const key = m.phase ?? ''
    if (!phases.has(key)) phases.set(key, [])
    phases.get(key).push(m)
  }
  const order = (p) => (p === '' ? PHASE_ORDER.length : PHASE_ORDER.indexOf(p) === -1 ? PHASE_ORDER.length : PHASE_ORDER.indexOf(p))
  return [...byTask.keys()]
    .sort()
    .map((task) => {
      const phases = [...byTask.get(task).keys()]
        .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
        .map((phase) => ({ phase: phase || null, ...aggregate(byTask.get(task).get(phase)) }))
      return { task, phases, total: aggregate([...byTask.get(task).values()].flat()) }
    })
}

// The Monday of the UTC week a timestamp falls in, as YYYY-MM-DD. UTC on purpose: a
// week that moves with the reader's timezone is not a week anybody can compare.
export function weekOf(t) {
  const d = new Date(t)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// One aggregate per week, oldest first. Sessions that never reached the API are left
// out: they have no number to trend, and they would swamp the count.
export function weekly(ms) {
  const buckets = new Map()
  for (const m of ms) {
    if (!m.turns) continue
    const t = m.end ?? m.start
    if (!t) continue
    const w = weekOf(t)
    if (!buckets.has(w)) buckets.set(w, [])
    buckets.get(w).push(m)
  }
  return [...buckets.keys()].sort().map((week) => ({ week, ...aggregate(buckets.get(week)) }))
}

export function aggregate(ms) {
  const a = { sessions: ms.length, noTurns: 0, missCauses: Object.fromEntries(MISS_CAUSES.map((c) => [c, 0])), subagents: ms.filter((m) => m.subagent).length, harnesses: {}, turns: 0, tokens: { input: 0, cacheRead: 0, write5m: 0, write1h: 0, output: 0, total: 0 }, cost: 0, pricedSessions: 0, unpriced: new Set(), peaks: [], misses: 0, modelSwitches: 0, compactions: 0, tools: {}, commands: {}, overCap: 0, phases: {} }
  for (const m of ms) {
    a.harnesses[m.harness] = (a.harnesses[m.harness] ?? 0) + 1
    a.turns += m.turns
    for (const k of ['input', 'cacheRead', 'write5m', 'write1h', 'output', 'total']) a.tokens[k] += m[k]
    if (m.cost === null) for (const mod of m.models) a.unpriced.add(mod)
    else {
      a.cost += m.cost
      a.pricedSessions++
    }
    if (m.turns) a.peaks.push(m.peak)
    else a.noTurns++
    a.misses += m.misses
    for (const c of MISS_CAUSES) a.missCauses[c] += m.missCauses?.[c] ?? 0
    a.modelSwitches += m.modelSwitches
    a.compactions += m.compactions
    a.overCap += m.overCap
    if (m.phase) a.phases[m.phase] = (a.phases[m.phase] ?? 0) + 1
    for (const [t, v] of Object.entries(m.tools)) {
      const x = (a.tools[t] ??= { n: 0, chars: 0 })
      x.n += v.n
      x.chars += v.chars
    }
    for (const [c, n] of Object.entries(m.commands)) a.commands[c] = (a.commands[c] ?? 0) + n
  }
  const prompt = a.tokens.input + a.tokens.cacheRead + a.tokens.write5m + a.tokens.write1h
  a.cacheHitRatio = prompt ? a.tokens.cacheRead / prompt : null
  a.peakP50 = q(a.peaks, 0.5)
  a.peakP95 = q(a.peaks, 0.95)
  a.toolChars = Object.values(a.tools).reduce((x, t) => x + t.chars, 0)
  a.unpriced = [...a.unpriced]
  if (!a.pricedSessions) a.cost = null
  return a
}
