#!/usr/bin/env node
// transcriptmeter — what your agent sessions cost, from the transcripts on your disk.
//
//   transcriptmeter [summary]          totals across sessions: tokens by class, cache hit ratio,
//                                      peak context, cost, tool output, top commands
//   transcriptmeter sessions           one row per session
//   transcriptmeter session <file|id>  one session in detail
//   transcriptmeter tools              tool results by tool and by shell command
//   transcriptmeter weeks              one row per week: a change in habits as a step
//   transcriptmeter prices             the price table and its date
//   transcriptmeter check              validate this package
//
//   --since 7d|2026-09-01   --project <substring of the working directory>
//   --harness claude|codex  --roots <dir,dir>   --json   --no-subagents   --cap 8000
//   --prices <file.json>    a custom price table {model: {input, output, read}}
//
// Reads Claude Code's ~/.claude/projects and Codex's ~/.codex/sessions. Keeps sizes and
// identifiers only: no message text is read back into the output, and a shell command
// is reduced to its first word or two. Nothing leaves the machine.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const flag = (name) => argv.includes(name)
// Every flag that takes no value. A word after one of these is a positional; a word
// after any other `--flag` is that flag's value.
const BOOLEAN = new Set(['--json', '--no-subagents', '--help'])
const positional = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--') || BOOLEAN.has(argv[i - 1])))
const cmd = positional[0] ?? 'summary'

async function main() {
  if (cmd === 'check') return check()
  if (cmd === 'help' || flag('--help')) return console.log(readFileSync(join(ROOT, 'bin', 'transcriptmeter.mjs'), 'utf8').split('\n').slice(1, 19).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  const { PRICES, PRICES_DATE } = await import('./lib/prices.mjs')
  if (cmd === 'prices') return console.log(`list prices, USD per million tokens, ${PRICES_DATE}\n${Object.entries(PRICES).map(([m, p]) => `  ${m.padEnd(20)} input ${p.input} · output ${p.output} · cache read ×${p.read}`).join('\n')}`)
  const { defaultRoots, loadSessions } = await import('./lib/discover.mjs')
  const { sinceMs } = await import('./lib/args.mjs')
  const { aggregate, sessionMetrics, weekly } = await import('./lib/metrics.mjs')
  const { renderSession, renderSessions, renderSummary, renderTools, renderWeeks } = await import('./lib/render.mjs')
  const custom = opt('--prices') ? JSON.parse(readFileSync(opt('--prices'), 'utf8')) : {}
  const roots = opt('--roots') ? opt('--roots').split(',').map((r) => resolve(r)) : defaultRoots()
  const since = sinceMs(opt('--since'))
  if (opt('--since') && since === null) {
    console.error(`transcriptmeter: cannot read --since ${opt('--since')} — use 7d, 12h, 2w or a date`)
    process.exit(2)
  }
  // The cap is applied while reading, so the count and the heading above it agree.
  const cap = Number(opt('--cap') ?? 8000)
  let ms = loadSessions(roots, cap).map((s) => sessionMetrics(s, custom))
  if (since) ms = ms.filter((m) => (m.end ?? m.start ?? 0) >= since)
  if (opt('--project')) ms = ms.filter((m) => (m.project ?? '').includes(opt('--project')))
  if (opt('--harness')) ms = ms.filter((m) => m.harness === opt('--harness'))
  if (flag('--no-subagents')) ms = ms.filter((m) => !m.subagent)
  ms.sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  if (cmd === 'session') {
    const key = positional[1]
    const m = ms.find((x) => x.file === resolve(key ?? '') || x.id === key || (key && x.file.includes(key)))
    if (!m) {
      console.error(`transcriptmeter: no session matches ${key}`)
      process.exit(1)
    }
    return console.log(flag('--json') ? JSON.stringify(m, null, 2) : renderSession(m))
  }
  if (cmd === 'weeks') {
    const w = weekly(ms)
    return console.log(flag('--json') ? JSON.stringify(w, null, 2) : renderWeeks(w))
  }
  const a = aggregate(ms)
  if (cmd === 'sessions') return console.log(flag('--json') ? JSON.stringify(ms, null, 2) : renderSessions(ms))
  if (cmd === 'tools') return console.log(flag('--json') ? JSON.stringify({ tools: a.tools, commands: a.commands, overCap: a.overCap, cap, toolChars: a.toolChars }, null, 2) : renderTools(a, cap))
  console.log(flag('--json') ? JSON.stringify(a, null, 2) : renderSummary(a, { since: opt('--since'), cap }))
}

function check() {
  const errors = []
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  if (pkg.name !== 'transcriptmeter') errors.push('package.json must be named transcriptmeter')
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) errors.push('no runtime dependencies — this is a CLI that must start instantly')
  if (!/^(?:git\+)?https:\/\/github\.com\/Allan-Nava\/transcriptmeter(?:\.git)?$/.test(pkg.repository?.url ?? '')) errors.push('package.json#repository must be the GitHub repo URL')
  for (const f of ['bin', 'README.md', 'CHANGELOG.md', 'LICENSE']) if (!pkg.files?.includes(f)) errors.push(`package.json#files is missing ${f}`)
  for (const f of ['README.md', 'CONTRIBUTING.md', 'CLAUDE.md', 'LICENSE', 'BACKLOG.md', 'ROADMAP.md', 'CHANGELOG.md']) if (!existsSync(join(ROOT, f))) errors.push(`${f} is missing`)
  if (existsSync(join(ROOT, 'CHANGELOG.md'))) {
    const log = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
    if (!/^## \[Unreleased\]/m.test(log)) errors.push('CHANGELOG.md needs an [Unreleased] section')
    if (!log.includes(`## [${pkg.version}]`)) errors.push(`CHANGELOG.md has no section for ${pkg.version}`)
  }
  if (existsSync(join(ROOT, 'README.md'))) {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    if (!/nothing\s+leaves\s+the\s+machine/i.test(readme)) errors.push('README.md must state that nothing leaves the machine')
    if (!/sizes and identifiers only|never .* message text/i.test(readme)) errors.push('README.md must state what is read and what is never shown')
    const PRICES_DATE = /PRICES_DATE = '(\d{4}-\d{2}-\d{2})'/.exec(readFileSync(join(ROOT, 'bin', 'lib', 'prices.mjs'), 'utf8'))?.[1]
    if (PRICES_DATE && !readme.includes(PRICES_DATE)) errors.push(`README.md must carry the price table's date ${PRICES_DATE}`)
  }
  for (const m of ['prices.mjs', 'metrics.mjs', 'render.mjs', 'discover.mjs', 'readers/claude.mjs', 'readers/codex.mjs', 'readers/common.mjs']) if (!existsSync(join(ROOT, 'bin', 'lib', m))) errors.push(`bin/lib/${m} is missing`)
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`)
    process.exit(1)
  }
  console.log(`ok — two readers, ${Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).bin).length} bin, manifests in order at ${pkg.version}`)
}

await main()
