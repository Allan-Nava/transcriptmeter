// Claude Code transcripts: ~/.claude/projects/<project-slug>/<session>.jsonl, one JSON per
// line. Only sizes and identifiers are kept — never message text, never a command beyond
// its first word or two.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { commandPrefix, isMachineTurn, phaseOf, taskOf, toolResultText } from './common.mjs'

// A session file is named after its session. A resumed one continues in a new file and
// keeps writing the original's id, so the id inside is not unique — 1 file in 1,754
// (2026-09-24) — while the name the harness gave it always is.
const FILE_ID = /^[0-9a-f-]{36}$/


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
    parent: null, // the session that spawned it: a subagent writes the spawner's sessionId
    start: null,
    end: null,
    models: {},
    turns: [], // one per API response: {t, model, input, cacheRead, write5m, write1h, output}
    tools: {}, // tool name → {n, chars}
    commands: {}, // Bash prefix → chars
    overCap: 0,
    phase: null,
    task: null, // the `thoughts/<id>` a first prompt names, when it names one
    userMessages: 0,
    compactions: 0,
    compactionsAt: [], // when, so a miss can be blamed on the one that caused it
  }
  const uses = new Map()
  // A tool name used for the first time is the visible half of a tool-set change:
  // the definitions that actually invalidate the prefix are not in the transcript.
  const toolNames = new Set()
  let lastTurn = null
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
    // A subagent's `sessionId` is the session that spawned it, not its own identity —
    // parent and children all report the same one, so one id was six rows in `sessions`
    // and `session <id>` could answer with a five-turn child. Its own identity is
    // `agentId` (2026-09-24: ~/.claude/projects/<slug>/<session>/subagents/agent-*.jsonl).
    if (e.sessionId && !s.parent && s.subagent) s.parent = e.sessionId
    if (e.agentId && s.subagent) s.id ??= e.agentId
    if (e.sessionId && !s.id && !s.subagent) s.id = FILE_ID.test(basename(file, '.jsonl')) ? basename(file, '.jsonl') : e.sessionId
    if (e.cwd && !s.project) s.project = e.cwd
    if (e.version && !s.version) s.version = e.version
    if (e.isSidechain) s.subagent = true
    if (e.isCompactSummary) {
      s.compactions++
      const at = e.timestamp ? Date.parse(e.timestamp) : NaN
      if (!Number.isNaN(at)) s.compactionsAt.push(at)
    }
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
        lastTurn = {
          t: ts,
          model: m.model ?? null,
          input: u.input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          write5m: cc.ephemeral_5m_input_tokens ?? (u.cache_creation_input_tokens ?? 0),
          write1h: cc.ephemeral_1h_input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          newTool: false,
        }
        s.turns.push(lastTurn)
        if (m.model) s.models[m.model] = (s.models[m.model] ?? 0) + 1
      }
      for (const c of blocks) {
        if (c.type !== 'tool_use') continue
        uses.set(c.id, { name: c.name, command: c.name === 'Bash' ? commandPrefix(c.input?.command) : null })
        if (c.name && !toolNames.has(c.name)) {
          toolNames.add(c.name)
          if (lastTurn) lastTurn.newTool = true
        }
      }
    } else if (e.type === 'user') {
      // A compaction summary is a `user` entry with prose in it, written by the
      // harness. Counting it would add one human message per compaction.
      let human = false
      if (e.isCompactSummary) blocks.length = 0
      for (const c of blocks) {
        if (c.type === 'text' && !isMachineTurn(c.text)) {
          human = true
          if (s.userMessages === 0) {
            s.phase ??= phaseOf(c.text)
            s.task ??= taskOf(c.text)
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
  // An older subagent file carries no agentId; its filename is the only identity it has.
  if (s.subagent && !s.id) s.id = basename(file).replace(/\.jsonl$/, '')
  return s
}
