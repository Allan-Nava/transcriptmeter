// What a first prompt says about the work, and nothing else it says. Both of these
// keep an identifier, never the prompt: a phase name from a closed list, and the task
// id out of a `thoughts/<id>/` path.
//
// How a QRSPI phase is actually named: "run the questions phase", "start with the
// Questions phase", "You are in the **Questions** phase". Until 2026-09-23 only the
// last was matched, and no person writes it.
const PHASE = /\b(questions|research|design|structure|plan|implement)\b\W{0,4}phase\b/i
const TASK = /\bthoughts\/([A-Za-z0-9][\w.-]{0,63})/

// Not every `user` entry is a person. The harness delivers hook output, command echoes,
// terminal input and background-task events through the same type, each wrapped in a tag
// of its own.
//
// A list of tags cannot stay right: it is read off one machine on one day, and a tag it
// has not seen is silently counted as a person. On 2026-09-23 this repository's own list
// had already drifted — `<bash-input>`, `<local-command-caveat>` and `<create-pr-command>`
// were not in it. So the rule is the shape, not the name: a turn whose whole content is
// one element, opening with a tag and closing on it, was written by the harness. 224 of
// the 280 tagged turns on that machine are that shape. The named list stays for the ones
// that open with a tag and do not close on it.
const MACHINE_TAG = /^<(task-notification|system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|create-pr-command|bash-input|ci-monitor-event|user-prompt-submit-hook)\b/

export function isMachineTurn(text) {
  const t = String(text ?? '').trim()
  if (MACHINE_TAG.test(t)) return true
  const open = /^<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)(?:\s[^>]*)?>/.exec(t)
  return open !== null && t.endsWith(`</${open[1]}>`)
}

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

// Programs that take a subcommand worth seeing: `git status` says more than `git`.
const SUB = ['git', 'npm', 'npx', 'pnpm', 'yarn', 'docker', 'kubectl', 'gh', 'cargo', 'go', 'make', 'python', 'python3', 'node', 'pip']
// …and the ones whose "subcommand" is a script, where the useful half is its name.
const INTERPRETER = ['python', 'python3', 'node', 'bash', 'sh', 'zsh', 'ruby', 'perl']

// Everything before the first word that is actually a program: a comment line, a line
// continuation, a leftover `&&` from a stripped `cd` hop, an opening brace, an
// environment assignment, the hop itself.
const NOISE = [
  /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, //   VAR=value
  /^cd\s+(?:"[^"]*"|'[^']*'|\S+)[ \t]*(?:&&|;|\n)\s*/, //        cd X && …
  /^#[^\n]*\n\s*/, //                                          a comment line
  /^\\\s*\n\s*/, //                                             a line continuation
  /^(?:&&|\|\||;|\{|\(|!)\s*/, //                                 leftovers and groupings
]

// A command reduced to what the report may show: the program's name, and its subcommand
// when the program takes one. A path is cut to its last segment — `/usr/bin/python3` is
// `python3` and `docs/scripts/new-release.sh` is `new-release.sh` — so the report says
// what ran without saying where it lives. Anything that survives all of that and still
// does not look like a program name is `?`: a fragment of somebody's shell line is not
// something this tool prints.
export function commandPrefix(command) {
  let s = String(command ?? '').trim()
  for (let i = 0; i < 16; i++) {
    let next = s
    for (const re of NOISE) next = next.replace(re, '')
    if (next === s) break
    s = next
  }
  const words = s.split(/\s+/).filter(Boolean)
  const name = (w) => String(w ?? '').split('/').filter(Boolean).pop() ?? ''
  const first = name(words[0])
  if (!/^[A-Za-z_][\w.+-]*$/.test(first)) return '?'
  if (!SUB.includes(first) || !words[1] || words[1].startsWith('-')) return first
  const second = INTERPRETER.includes(first) ? name(words[1]) : words[1]
  return /^[\w.+-]+$/.test(second) ? `${first} ${second}` : first
}
