// List prices, USD per million tokens, from the two vendors' own pages, both read on
// PRICES_DATE:
//
//   Anthropic  platform.claude.com/docs/en/about-claude/pricing
//   OpenAI     developers.openai.com/api/docs/pricing
//
// `read` is a multiplier on input, and so are `write5m` / `write1h`. Anthropic charges
// 1.25× to write a five-minute cache entry and 2× for the hour; OpenAI charges nothing
// to write one, which is why its entries say 1 rather than inheriting the default. On
// this machine every Codex `cache_write_input_tokens` is 0 anyway (27 of 27 records,
// 2026-09-23), so the multiplier is correctness rather than money.
//
// A model not in this table gets tokens but no dollars — the report says which ones.
// Keep the date honest when you touch a number.
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
  // OpenAI, as Codex reports them. `reasoning_output_tokens` is inside `output_tokens`
  // (9 of 9 records that had any, 2026-09-23), so output is priced once.
  'gpt-6-astra': { input: 10, output: 50, read: 0.1, write5m: 1, write1h: 1 },
  'gpt-6-luna': { input: 0.1, output: 0.5, read: 0.1, write5m: 1, write1h: 1 },
  'gpt-5.6-terra': { input: 2, output: 12, read: 0.1, write5m: 1, write1h: 1 },
  'gpt-5.6-sol': { input: 2, output: 10, read: 0.1, write5m: 1, write1h: 1 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2, read: 0.1, write5m: 1, write1h: 1 },
})
export const WRITE_5M = 1.25
export const WRITE_1H = 2

// `claude-haiku-4-5-20251001` → `claude-haiku-4-5`; an unknown id stays itself.
export function priceFor(model, custom = {}) {
  if (!model) return null
  const id = String(model).replace(/-\d{8}$/, '')
  return custom[id] ?? custom[model] ?? PRICES[id] ?? null
}

// One API response's cost, or null when the model is unpriced. A vendor that does not
// charge for writing a cache entry says so in its own row.
export function costOf(u, price) {
  if (!price) return null
  const w5 = u.write5m ?? u.cacheWrite ?? 0
  const w1 = u.write1h ?? 0
  const m5 = price.write5m ?? WRITE_5M
  const m1 = price.write1h ?? WRITE_1H
  return (u.input * price.input + u.cacheRead * price.input * price.read + w5 * price.input * m5 + w1 * price.input * m1 + u.output * price.output) / 1e6
}
