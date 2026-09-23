// The CHANGELOG is the only file that says what a release contains, and nothing checked
// it against what the release actually was. This repository got that wrong three times
// in one day: 0.0.1 said "Not published" after it was published, 0.1.0 said "the first
// release worth installing" and never reached the registry, and 0.2.0 shipped the Codex
// prices while listing them under [Unreleased]. None of it was caught, because
// release.yml verifies that the tag and package.json agree on a version — which they
// always did — and nothing read the prose.
//
// `release: true` is the stricter pass the release workflow runs on the tagged tree:
// anything still sitting under [Unreleased] at that point is shipping unannounced.
export function changelogFaults(text, version, { release = false } = {}) {
  const faults = []
  const lines = String(text ?? '').split('\n')
  const unreleasedAt = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l))
  if (unreleasedAt === -1) faults.push('CHANGELOG.md needs an [Unreleased] section')

  const releases = []
  for (const [i, l] of lines.entries()) {
    const m = /^## \[(\d+\.\d+\.\d+)\]/.exec(l)
    if (m) releases.push({ version: m[1], line: i })
  }
  if (!releases.length) faults.push('CHANGELOG.md has no released section')
  else if (releases[0].version !== version) {
    faults.push(`CHANGELOG.md's newest section is ${releases[0].version}, but package.json says ${version} — the release would ship undescribed`)
  }

  if (release && unreleasedAt !== -1) {
    const next = releases.find((r) => r.line > unreleasedAt)?.line ?? lines.length
    const body = lines.slice(unreleasedAt + 1, next).join('\n').trim()
    if (body) faults.push(`CHANGELOG.md still has entries under [Unreleased]; at a tag they ship without being announced:\n    ${body.split('\n')[0]}`)
  }
  return faults
}
