// What a first prompt says about the work, and nothing else it says. Both of these
// keep an identifier, never the prompt: a phase name from a closed list, and the task
// id out of a `thoughts/<id>/` path.
//
// How a QRSPI phase is actually named: "run the questions phase", "start with the
// Questions phase", "You are in the **Questions** phase". Until 2026-09-23 only the
// last was matched, and no person writes it.
const PHASE = /\b(questions|research|design|structure|plan|implement)\b\W{0,4}phase\b/i
const TASK = /\bthoughts\/([A-Za-z0-9][\w.-]{0,63})/

// Not every `user` entry is a person. The harness delivers hook output, command echoes
// and background-task events through the same type, wrapped in a tag of their own.
export const MACHINE = /^\s*<(task-notification|system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|ci-monitor-event|user-prompt-submit-hook)\b/

export function phaseOf(text) {
  const p = PHASE.exec(text ?? '')
  return p ? p[1][0].toUpperCase() + p[1].slice(1).toLowerCase() : null
}

export function taskOf(text) {
  return TASK.exec(text ?? '')?.[1] ?? null
}

export function toolResultText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('')
  if (content && typeof content === 'object') return JSON.stringify(content)
  return ''
}

// A command reduced to what the report may show: its first word, or first two when
// the first takes a subcommand. Leading `cd X &&` hops and VAR=value are skipped.
export function commandPrefix(command) {
  let s = String(command ?? '').trim()
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '').replace(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)[ \t]*(?:&&|;|\n)\s*/, '')
    if (next === s) break
    s = next
  }
  const words = s.split(/\s+/)
  const first = words[0] ?? ''
  const sub = ['git', 'npm', 'npx', 'pnpm', 'yarn', 'docker', 'kubectl', 'gh', 'cargo', 'go', 'make', 'python', 'python3', 'node', 'pip']
  return sub.includes(first) && words[1] && !words[1].startsWith('-') ? `${first} ${words[1]}` : first
}
