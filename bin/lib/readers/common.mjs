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
