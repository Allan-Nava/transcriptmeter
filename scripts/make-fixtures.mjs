// Synthetic transcripts with the real field shapes and no real content:
//
//   node scripts/make-fixtures.mjs
//
// Writes test/fixtures/, which is committed — the tests and the CI smoke read those
// files, they do not regenerate them. CI regenerates and fails on a diff, so the
// fixtures and this generator cannot drift apart silently. A real transcript never
// enters the repository.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test')
const j = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
const t0 = Date.parse('2026-09-20T10:00:00Z')
const ts = (m) => new Date(t0 + m * 60000).toISOString()
const base = (type, m, extra) => ({ type, sessionId: 'sess-claude-1', timestamp: ts(m), cwd: '/Users/dev/app', version: '2.1.280', isSidechain: false, ...extra })
const usage = (input, read, w5, w1, out) => ({ input_tokens: input, cache_creation_input_tokens: w5 + w1, cache_read_input_tokens: read, output_tokens: out, cache_creation: { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1 }, service_tier: 'standard' })
const claude = [
  // A human turn's content is a plain string in a real transcript — and the phase is
  // named the way a person names it, not the way the skill's template does.
  base('user', 0, { message: { role: 'user', content: 'kick off the research phase for TM-1' } }),
  // Same entry type, not a person: this must not be counted as a human message.
  base('user', 0, { message: { role: 'user', content: '<task-notification>\n<event>a background task finished</event>\n</task-notification>' } }),
  base('assistant', 1, { requestId: 'req_1', message: { role: 'assistant', model: 'claude-opus-5', usage: usage(12000, 0, 30000, 0, 800), content: [{ type: 'text', text: 'running tests' }] } }),
  base('assistant', 1, { requestId: 'req_1', message: { role: 'assistant', model: 'claude-opus-5', usage: usage(12000, 0, 30000, 0, 800), content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'cd /Users/dev/app && npm test -- --grep x' } }] } }),
  base('user', 2, { message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'x'.repeat(12000) }] } }),
  base('assistant', 3, { message: { role: 'assistant', model: 'claude-opus-5', usage: usage(3000, 42000, 4000, 0, 500), content: [{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: '/Users/dev/app/a.js' } }] } }),
  base('user', 4, { message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu2', content: [{ type: 'text', text: 'y'.repeat(3000) }] }] } }),
  // a model switch and a cache miss after a warm prefix
  base('assistant', 5, { message: { role: 'assistant', model: 'claude-sonnet-5', usage: usage(49000, 0, 0, 0, 200), content: [{ type: 'text', text: 'done' }] } }),
  base('user', 6, { message: { role: 'user', content: [{ type: 'text', text: 'thanks' }] } }),
]
const claude2 = [
  { ...base('user', 100, { message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } }), sessionId: 'sess-claude-2' },
  { ...base('assistant', 101, { message: { role: 'assistant', model: 'claude-unknown-9', usage: usage(1000, 0, 0, 500, 100), content: [{ type: 'text', text: 'hi' }] } }), sessionId: 'sess-claude-2' },
]
const sub = [{ ...base('assistant', 50, { message: { role: 'assistant', model: 'claude-haiku-4-5-20251001', usage: usage(2000, 0, 0, 0, 300), content: [{ type: 'text', text: 'sub' }] } }), sessionId: 'agent-1', isSidechain: true }]
mkdirSync(join(HERE, 'fixtures', 'claude', '-Users-dev-app'), { recursive: true })
writeFileSync(join(HERE, 'fixtures', 'claude', '-Users-dev-app', 'sess-claude-1.jsonl'), j(claude))
writeFileSync(join(HERE, 'fixtures', 'claude', '-Users-dev-app', 'sess-claude-2.jsonl'), j(claude2))
writeFileSync(join(HERE, 'fixtures', 'claude', '-Users-dev-app', 'agent-1.jsonl'), j(sub))
const codex = [
  { timestamp: ts(200), type: 'session_meta', payload: { session_id: 'sess-codex-1', id: 'sess-codex-1', timestamp: ts(200), cwd: '/Users/dev/app', cli_version: '0.155.1', model_provider: 'openai', originator: 'codex_exec' } },
  { timestamp: ts(200), type: 'world_state', payload: { state: { collaboration_mode: { mode: 'default', model: 'gpt-6-luna' } } } },
  { timestamp: ts(200), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'do the thing' }] } },
  { timestamp: ts(201), type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'c1', input: 'const r = await tools.exec_command({cmd:"git log --oneline",max_output_tokens:6000}); text(r.output);' } },
  { timestamp: ts(201), type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'c1', output: 'z'.repeat(9000) } },
  { timestamp: ts(202), type: 'token_usage_record', payload: { session_id: 'sess-codex-1', usage: { input_tokens: 14208, cached_input_tokens: 11008, cache_write_input_tokens: 0, output_tokens: 106, reasoning_output_tokens: 0, total_tokens: 14314 } } },
  { timestamp: ts(203), type: 'token_usage_record', payload: { session_id: 'sess-codex-1', usage: { input_tokens: 20000, cached_input_tokens: 19000, cache_write_input_tokens: 0, output_tokens: 300, reasoning_output_tokens: 50, total_tokens: 20300 } } },
]
mkdirSync(join(HERE, 'fixtures', 'codex', '2026', '09', '23'), { recursive: true })
writeFileSync(join(HERE, 'fixtures', 'codex', '2026', '09', '23', 'rollout-2026-09-23T10-00-00-sess-codex-1.jsonl'), j(codex))
console.log('fixtures written')
