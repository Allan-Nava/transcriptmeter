// Anthropic list prices, USD per million tokens (platform.claude.com/docs/en/about-claude/pricing,
// read 2026-09-23). Cache reads are a multiplier on input; writes are 1.25× for the five-minute
// TTL and 2× for the hour. A model not in this table gets tokens but no dollars — the report
// says which ones. Keep the date honest when you touch a number.
export const PRICES_DATE = '2026-09-23'
export const PRICES = Object.freeze({
  'claude-fable-5-1': { input: 10, output: 50, read: 0.025 },
  'claude-mythos-5-1': { input: 10, output: 50, read: 0.025 },
  'claude-fable-5': { input: 10, output: 50, read: 0.1 },
  'claude-mythos-5': { input: 10, output: 50, read: 0.1 },
  'claude-opus-5-5': { input: 4, output: 20, read: 0.05 },
  'claude-opus-5': { input: 5, output: 25, read: 0.1 },
  'claude-opus-4-8': { input: 5, output: 25, read: 0.1 },
  'claude-opus-4-7': { input: 5, output: 25, read: 0.1 },
  'claude-opus-4-6': { input: 5, output: 25, read: 0.1 },
  'claude-opus-4-5': { input: 5, output: 25, read: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, read: 0.1 },
  'claude-sonnet-4-6': { input: 3, output: 15, read: 0.1 },
  'claude-sonnet-4-5': { input: 3, output: 15, read: 0.1 },
  'claude-haiku-4-5': { input: 1, output: 5, read: 0.1 },
})
export const WRITE_5M = 1.25
export const WRITE_1H = 2

// `claude-haiku-4-5-20251001` → `claude-haiku-4-5`; an unknown id stays itself.
export function priceFor(model, custom = {}) {
  if (!model) return null
  const id = String(model).replace(/-\d{8}$/, '')
  return custom[id] ?? custom[model] ?? PRICES[id] ?? null
}

// One API response's cost, or null when the model is unpriced.
export function costOf(u, price) {
  if (!price) return null
  const w5 = u.write5m ?? u.cacheWrite ?? 0
  const w1 = u.write1h ?? 0
  return (u.input * price.input + u.cacheRead * price.input * price.read + w5 * price.input * WRITE_5M + w1 * price.input * WRITE_1H + u.output * price.output) / 1e6
}
