/** Format currency for PSA tables (tabular nums applied in className). */
export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
}
