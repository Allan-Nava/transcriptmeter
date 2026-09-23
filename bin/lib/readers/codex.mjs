// Codex CLI sessions: ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl. Each line is
// {type, payload}; `token_usage_record` carries this response's usage, where
// `input_tokens` is the whole prompt and `cached_input_tokens` the part served from cache.
import { readFileSync } from 'node:fs'
import { commandPrefix, toolResultText } from './common.mjs'

export function readCodexSession(file) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    return null
  }
  const s = { harness: 'codex', file, id: null, project: null, version: null, subagent: false, start: null, end: null, models: {}, turns: [], tools: {}, commands: {}, over8k: 0, phase: null, userMessages: 0, compactions: 0 }
  let model = null
  const calls = new Map()
  for (const line of lines) {
    if (!line) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const p = e.payload ?? {}
    const ts = e.timestamp ? Date.parse(e.timestamp) : p.timestamp ? Date.parse(p.timestamp) : NaN
    if (!Number.isNaN(ts)) {
      if (s.start === null || ts < s.start) s.start = ts
      if (s.end === null || ts > s.end) s.end = ts
    }
    if (e.type === 'session_meta') {
      s.id = p.session_id ?? p.id ?? s.id
      s.project = p.cwd ?? s.project
      s.version = p.cli_version ?? s.version
    } else if (e.type === 'world_state') {
      model = p.state?.collaboration_mode?.model ?? model
    } else if (e.type === 'turn_context') {
      model = p.model ?? model
    } else if (e.type === 'token_usage_record') {
      const u = p.usage ?? {}
      const t = { t: p.create_time ? p.create_time * 1000 : s.end, model, input: (u.input_tokens ?? 0) - (u.cached_input_tokens ?? 0), cacheRead: u.cached_input_tokens ?? 0, write5m: u.cache_write_input_tokens ?? 0, write1h: 0, output: u.output_tokens ?? 0 }
      s.turns.push(t)
      if (model) s.models[model] = (s.models[model] ?? 0) + 1
    } else if (e.type === 'response_item' && p.type === 'message' && p.role === 'user') {
      const texts = (p.content ?? []).filter((c) => c.type === 'input_text' && !/^<(skills_instructions|recommended_plugins|multi_agent|environment_context|permissions_instructions)/.test(c.text ?? ''))
      if (texts.length) s.userMessages++
    } else if (e.type === 'response_item' && (p.type === 'custom_tool_call' || p.type === 'function_call')) {
      const input = String(p.input ?? p.arguments ?? '')
      const cmd = /exec_command\(\{cmd:\s*"((?:[^"\\]|\\.)*)"/.exec(input)?.[1] ?? null
      calls.set(p.call_id, { name: p.name === 'exec' ? 'Bash' : p.name ?? '?', command: cmd ? commandPrefix(cmd) : null })
    } else if (e.type === 'response_item' && (p.type === 'custom_tool_call_output' || p.type === 'function_call_output')) {
      const use = calls.get(p.call_id) ?? { name: '?' }
      const n = toolResultText(p.output).length
      const t = (s.tools[use.name] ??= { n: 0, chars: 0 })
      t.n++
      t.chars += n
      if (n > 8000) s.over8k++
      if (use.command) s.commands[use.command] = (s.commands[use.command] ?? 0) + n
    }
  }
  if (!s.turns.length && !s.userMessages) return null
  return s
}
