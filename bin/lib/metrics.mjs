// From sessions to numbers. The five KPIs the qrspi token-efficiency skill names:
// 1 peak context, 3 tokens per completed task (here: per session), 4 cache hit ratio,
// plus what the tools returned and what it all cost.
import { costOf, priceFor } from './prices.mjs'

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
    if (prev && prev.prompt > 20000 && prev.cacheRead / prev.prompt > 0.5 && prompt > 20000 && t.cacheRead / prompt < 0.1) misses++
    if (prev && prev.model && t.model && prev.model !== t.model) modelSwitches++
    prev = { prompt, cacheRead: t.cacheRead, model: t.model }
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

export function aggregate(ms) {
  const a = { sessions: ms.length, subagents: ms.filter((m) => m.subagent).length, harnesses: {}, turns: 0, tokens: { input: 0, cacheRead: 0, write5m: 0, write1h: 0, output: 0, total: 0 }, cost: 0, pricedSessions: 0, unpriced: new Set(), peaks: [], misses: 0, modelSwitches: 0, compactions: 0, tools: {}, commands: {}, overCap: 0, phases: {} }
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
    a.misses += m.misses
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
