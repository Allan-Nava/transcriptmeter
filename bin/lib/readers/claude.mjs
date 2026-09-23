// Claude Code transcripts: ~/.claude/projects/<project-slug>/<session>.jsonl, one JSON per
// line. Only sizes and identifiers are kept — never message text, never a command beyond
// its first word or two.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { commandPrefix, toolResultText } from './common.mjs'

const PHASE = /You are in the \*\*(Questions|Research|Design|Structure|Plan|Implement)\*\* phase/

export function readClaudeSession(file, cap = 8000) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    return null
  }
  const s = {
    harness: 'claude',
    file,
    id: null,
    project: null,
    version: null,
    subagent: basename(file).startsWith('agent-'),
    start: null,
    end: null,
    models: {},
    turns: [], // one per API response: {t, model, input, cacheRead, write5m, write1h, output}
    tools: {}, // tool name → {n, chars}
    commands: {}, // Bash prefix → chars
    overCap: 0,
    phase: null,
    userMessages: 0,
    compactions: 0,
  }
  const uses = new Map()
  // One API response is written as several `assistant` lines — one per content block,
  // same requestId, same usage repeated on each. Count the usage once per response.
  const seen = new Set()
  for (const line of lines) {
    if (!line) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e.sessionId && !s.id) s.id = e.sessionId
    if (e.cwd && !s.project) s.project = e.cwd
    if (e.version && !s.version) s.version = e.version
    if (e.isSidechain) s.subagent = true
    if (e.isCompactSummary) s.compactions++
    const ts = e.timestamp ? Date.parse(e.timestamp) : NaN
    if (!Number.isNaN(ts)) {
      if (s.start === null || ts < s.start) s.start = ts
      if (s.end === null || ts > s.end) s.end = ts
    }
    // The usage is accounted before the content is looked at: a response whose
    // content is not a block list still cost what it cost.
    const m = e.message
    if (!m) continue
    if (e.type === 'assistant') {
      const u = m.usage
      const rid = e.requestId ?? m.id ?? null
      const dup = rid !== null && seen.has(rid)
      if (rid !== null) seen.add(rid)
      if (!dup && u && typeof u.input_tokens === 'number' && m.model !== '<synthetic>') {
        const cc = u.cache_creation ?? {}
        s.turns.push({
          t: ts,
          model: m.model ?? null,
          input: u.input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          write5m: cc.ephemeral_5m_input_tokens ?? (u.cache_creation_input_tokens ?? 0),
          write1h: cc.ephemeral_1h_input_tokens ?? 0,
          output: u.output_tokens ?? 0,
        })
        if (m.model) s.models[m.model] = (s.models[m.model] ?? 0) + 1
      }
      if (Array.isArray(m.content)) for (const c of m.content) if (c.type === 'tool_use') uses.set(c.id, { name: c.name, command: c.name === 'Bash' ? commandPrefix(c.input?.command) : null })
    } else if (e.type === 'user' && Array.isArray(m.content)) {
      let human = false
      for (const c of m.content) {
        if (c.type === 'text') {
          human = true
          if (!s.phase && s.userMessages === 0) {
            const p = PHASE.exec(c.text ?? '')
            if (p) s.phase = p[1]
          }
        }
        if (c.type === 'tool_result') {
          const use = uses.get(c.tool_use_id) ?? { name: '?' }
          const n = toolResultText(c.content).length
          const t = (s.tools[use.name] ??= { n: 0, chars: 0 })
          t.n++
          t.chars += n
          if (n > cap) s.overCap++
          if (use.command) s.commands[use.command] = (s.commands[use.command] ?? 0) + n
        }
      }
      if (human) s.userMessages++
    }
  }
  if (!s.turns.length && !s.userMessages) return null
  return s
}
