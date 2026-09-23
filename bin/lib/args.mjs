// `--since 7d|12h|2w|2026-09-01` → a timestamp in ms, or null when unreadable. Pure, so
// the CLI's one piece of parsing that can silently drop every session is tested.
export function sinceMs(v, now = Date.now()) {
  if (!v) return null
  const m = /^(\d+)([hdw])$/.exec(String(v).trim())
  if (m) return now - Number(m[1]) * { h: 3600000, d: 86400000, w: 604800000 }[m[2]]
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}
