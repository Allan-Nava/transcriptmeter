// Claude Code transcripts: ~/.claude/projects/<project-slug>/<session>.jsonl, one JSON per
// line. Only sizes and identifiers are kept — never message text, never a command beyond
// its first word or two.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { commandPrefix, toolResultText } from './common.mjs'

// How a QRSPI phase is actually named in a first prompt: "run the questions phase",
// "start with the Questions phase", "You are in the **Questions** phase". The literal
// template form was the only one this matched until 2026-09-23, and no real transcript
// uses it — 125 first prompts named a phase, none were recognised.
const PHASE = /\b(questions|research|design|structure|plan|implement)\b\W{0,4}phase\b/i

// Not every `user` entry is a person. The harness delivers hook output, command echoes
// and background-task events through the same type, wrapped in a tag of their own.
const MACHINE = /^\s*<(task-notification|system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|ci-monitor-event|user-prompt-submit-hook)\b/

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
    // A human turn carries `content` as a plain string in a real transcript and as a
    // block list in a synthetic one — both shapes are in the wild (2026-09-23, 161
    // files). Reading only the block list counted no human messages at all and never
    // matched a QRSPI phase prompt.
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? m.content : []
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
      for (const c of blocks) if (c.type === 'tool_use') uses.set(c.id, { name: c.name, command: c.name === 'Bash' ? commandPrefix(c.input?.command) : null })
    } else if (e.type === 'user') {
      let human = false
      for (const c of blocks) {
        if (c.type === 'text' && !MACHINE.test(c.text ?? '')) {
          human = true
          if (!s.phase && s.userMessages === 0) {
            const p = PHASE.exec(c.text ?? '')
            if (p) s.phase = p[1][0].toUpperCase() + p[1].slice(1).toLowerCase()
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
