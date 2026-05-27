// Small shared formatting helpers for analytics tables/cards. Kept generic so
// later modules (variance, amortization) can reuse them.

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

/** Format a number as USD currency; renders an em dash for nullish/NaN input. */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return currencyFmt.format(value)
}

/** "2026-03" → "Mar 2026". Returns the input unchanged if unparseable. */
export function formatMonthLabel(monthKey: string): string {
  const m = monthKey.match(/^(\d{4})-(\d{1,2})$/)
  if (!m) return monthKey
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** The current month as a "YYYY-MM" key (local time). */
export function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
