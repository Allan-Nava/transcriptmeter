// Where the transcripts are. Claude Code: <root>/<project-slug>/*.jsonl. Codex:
// <root>/<yyyy>/<mm>/<dd>/*.jsonl. `--roots a,b` overrides both defaults; a root is
// treated as Codex when it contains a `sessions` segment or year directories.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readClaudeSession } from './readers/claude.mjs'
import { readCodexSession } from './readers/codex.mjs'

export const defaultRoots = (env = process.env) => [join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects'), join(env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions')]

function* jsonlFiles(root, depth = 0) {
  if (!existsSync(root)) return
  for (const f of readdirSync(root)) {
    const p = join(root, f)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (depth < 4) yield* jsonlFiles(p, depth + 1)
    } else if (f.endsWith('.jsonl')) yield p
  }
}

export function kindOf(root) {
  if (/(^|\/)\.?codex(\/|$)|(^|\/)sessions(\/|$)/.test(root)) return 'codex'
  return 'claude'
}

export function loadSessions(roots) {
  const out = []
  for (const root of roots) {
    const read = kindOf(root) === 'codex' ? readCodexSession : readClaudeSession
    for (const f of jsonlFiles(root)) {
      const s = read(f)
      if (s) out.push(s)
    }
  }
  return out
}
