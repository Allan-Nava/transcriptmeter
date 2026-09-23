import { MISS_CAUSES } from './metrics.mjs'
import { PRICES_DATE } from './prices.mjs'

// "3 compaction · 2 model switch" — only the causes that happened.
const causes = (m) => MISS_CAUSES.filter((c) => (m?.[c] ?? 0) > 0).map((c) => `${m[c]} ${c}`).join(' · ')

export const k = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US'))
export const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`)
export const usd = (x) => (x === null || x === undefined ? '—' : `$${x.toFixed(2)}`)
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '—')
const base = (p) => (p ? String(p).split('/').filter(Boolean).pop() : '—')

function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  const line = (cells) => `│ ${cells.map((c, i) => String(c).padEnd(w[i])).join(' │ ')} │`
  return [line(headers), `├${w.map((n) => '─'.repeat(n + 2)).join('┼')}┤`, ...rows.map(line)].join('\n')
}

export function renderSummary(a, { since, cap = 8000 } = {}) {
  const top = Object.entries(a.commands).sort((x, y) => y[1] - x[1]).slice(0, 8)
  const tools = Object.entries(a.tools).sort((x, y) => y[1].chars - x[1].chars).slice(0, 6)
  return [
    `## ${k(a.sessions)} sessions${since ? ` since ${since}` : ''} · ${Object.entries(a.harnesses).map(([h, n]) => `${h} ${k(n)}`).join(', ')}${a.subagents ? ` · ${k(a.subagents)} subagent` : ''} · ${k(a.turns)} API turns${a.noTurns ? ` · ${k(a.noTurns)} opened and never reached the API` : ''}`,
    `tokens: ${k(a.tokens.total)} total — uncached input ${k(a.tokens.input)} · cache read ${k(a.tokens.cacheRead)} · cache write ${k(a.tokens.write5m + a.tokens.write1h)} (${k(a.tokens.write1h)} at 1h) · output ${k(a.tokens.output)}`,
    `cache hit ratio ${pct(a.cacheHitRatio)} · cache misses after a warm prefix ${k(a.misses)}${a.misses ? ` (${causes(a.missCauses)})` : ''} · model switches ${k(a.modelSwitches)} · compactions ${k(a.compactions)}`,
    `peak context per session: p50 ${k(a.peakP50)} · p95 ${k(a.peakP95)} tokens`,
    `estimated cost ${usd(a.cost)} at list prices of ${PRICES_DATE}${a.unpriced.length ? ` — unpriced models, tokens only: ${a.unpriced.join(', ')}` : ''}`,
    `tool results: ${k(a.toolChars)} characters (≈ ${k(a.toolChars / 4)} tokens) · ${k(a.overCap)} results over ${k(cap)} characters · by tool: ${tools.map(([t, v]) => `${t} ${k(v.chars)}`).join(' · ')}`,
    top.length ? `top shell commands by result size: ${top.map(([c, n]) => `\`${c}\` ${k(n)}`).join(' · ')}` : '',
    Object.keys(a.phases).length ? `QRSPI phases seen: ${Object.entries(a.phases).map(([p, n]) => `${p} ${n}`).join(' · ')}` : '',
  ].filter(Boolean).join('\n')
}

export function renderSessions(ms) {
  const rows = ms.map((m) => [day(m.start), m.harness, base(m.project) + (m.subagent ? ' (sub)' : ''), m.models.map((x) => x.replace(/^claude-/, '')).join('+') || '—', k(m.turns), k(m.peak), pct(m.cacheHitRatio), k(m.output), usd(m.cost), m.phase ?? ''])
  return table(['date', 'harness', 'project', 'model', 'turns', 'peak ctx', 'cache', 'output', 'cost', 'phase'], rows)
}

export function renderSession(m) {
  const tools = Object.entries(m.tools).sort((x, y) => y[1].chars - x[1].chars)
  const top = Object.entries(m.commands).sort((x, y) => y[1] - x[1]).slice(0, 8)
  return [
    `## ${m.harness} session ${m.id ?? '—'}`,
    `project ${m.project ?? '—'} · ${day(m.start)} · ${m.minutes === null ? '—' : `${Math.round(m.minutes)} min`} · models ${m.models.join(', ') || '—'}${m.phase ? ` · QRSPI ${m.phase}` : ''}${m.subagent ? ' · subagent' : ''}`,
    `${k(m.turns)} API turns · ${k(m.userMessages)} human messages · ${k(m.compactions)} compactions`,
    `tokens: ${k(m.total)} — uncached input ${k(m.input)} · cache read ${k(m.cacheRead)} · cache write ${k(m.write5m + m.write1h)} · output ${k(m.output)}`,
    `peak context ${k(m.peak)} · cache hit ratio ${pct(m.cacheHitRatio)} · misses after a warm prefix ${k(m.misses)}${m.misses ? ` (${causes(m.missCauses)})` : ''} · model switches ${k(m.modelSwitches)}`,
    `estimated cost ${usd(m.cost)}`,
    `tool results ${k(m.toolChars)} characters · over the cap: ${k(m.overCap)}${tools.length ? ` · ${tools.map(([t, v]) => `${t} ${k(v.chars)} (${v.n})`).join(' · ')}` : ''}`,
    top.length ? `top shell commands by result size: ${top.map(([c, n]) => `\`${c}\` ${k(n)}`).join(' · ')}` : '',
  ].filter(Boolean).join('\n')
}

// A trend is only readable if every row is the same shape: one line per week, the
// columns in the order you would ask about them — how much work, how much of it was
// cached, how big it got, what went wrong, what it cost.
// A run reads down its phases and ends on the line that answers KPI 3: what the whole
// task cost, in tokens and in dollars.
export function renderRuns(rs) {
  if (!rs.length) return 'No session names a thoughts/<task> in its first prompt.'
  const row = (label, a) => [label, k(a.sessions), k(a.turns), k(a.peakP50), pct(a.cacheHitRatio), k(a.tokens.total), k(a.tokens.output), usd(a.cost)]
  const out = []
  for (const r of rs) {
    out.push(`## ${r.task}`)
    out.push(table(['phase', 'sessions', 'turns', 'peak p50', 'cache', 'tokens', 'output', 'cost'], [...r.phases.map((p) => row(p.phase ?? '—', p)), row('— whole run', r.total)]))
    out.push('')
  }
  out.push('KPI 1 is peak p50, KPI 3 is the whole run\'s tokens, KPI 4 is cache. A session')
  out.push('whose first prompt named no phase sorts last, under —.')
  return out.join('\n')
}

export function renderWeeks(weeks) {
  if (!weeks.length) return 'No week has a session that reached the API.'
  const rows = weeks.map((w) => [
    w.week,
    k(w.sessions),
    k(w.turns),
    k(w.tokens.total),
    pct(w.cacheHitRatio),
    k(w.peakP50),
    k(w.misses),
    MISS_CAUSES.filter((c) => w.missCauses[c] > 0).sort((a, b) => w.missCauses[b] - w.missCauses[a])[0] ?? '—',
    usd(w.cost),
  ])
  return [
    `## ${k(weeks.length)} weeks, ${weeks[0].week} to ${weeks[weeks.length - 1].week}`,
    table(['week', 'sessions', 'turns', 'tokens', 'cache', 'peak p50', 'misses', 'mostly', 'cost'], rows),
    '',
    'Weeks start on Monday, UTC. Sessions that never reached the API are left out.',
  ].join('\n')
}

export function renderTools(a, cap) {
  const tools = Object.entries(a.tools).sort((x, y) => y[1].chars - x[1].chars)
  const top = Object.entries(a.commands).sort((x, y) => y[1] - x[1]).slice(0, 15)
  return [
    `## Tool results across ${k(a.sessions)} sessions: ${k(a.toolChars)} characters (≈ ${k(a.toolChars / 4)} tokens)`,
    table(['tool', 'results', 'characters', 'share'], tools.map(([t, v]) => [t, k(v.n), k(v.chars), pct(v.chars / Math.max(1, a.toolChars))])),
    '',
    `Tool results over ${k(cap)} characters: ${k(a.overCap)}.`,
    `Top shell commands by result size:`,
    table(['command', 'characters'], top.map(([c, n]) => [c, k(n)])),
  ].join('\n')
}
