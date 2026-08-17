type DatedSource = { date: string }

export type InvoicePeriod = {
  start: string
  end: string
}

export type InvoicePeriodValidation = {
  period: InvoicePeriod | null
  error: string | null
  sourceCount: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidInvoiceDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return parsed.toISOString().slice(0, 10) === value
}

export function invoicePeriodDefaults(
  sources: DatedSource[],
  billingDate = new Date().toISOString().slice(0, 10),
): InvoicePeriod {
  const sourceDates = sources.map((source) => source.date).filter(isValidInvoiceDate).sort()
  if (sourceDates.length > 0) {
    return { start: sourceDates[0], end: sourceDates[sourceDates.length - 1] }
  }

  const monthStart = `${billingDate.slice(0, 7)}-01`
  const [year, month] = monthStart.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start: monthStart, end: monthEnd }
}

export function isWithinInvoicePeriod(date: string, period: InvoicePeriod): boolean {
  return isValidInvoiceDate(date) && date >= period.start && date <= period.end
}

export function normalizeInvoicePeriod(
  start: string,
  end: string,
  sources: DatedSource[],
): InvoicePeriodValidation {
  if (!start) return { period: null, error: 'Select a period start date.', sourceCount: 0 }
  if (!end) return { period: null, error: 'Select a period end date.', sourceCount: 0 }
  if (!isValidInvoiceDate(start) || !isValidInvoiceDate(end)) {
    return { period: null, error: 'Enter a valid invoice period.', sourceCount: 0 }
  }
  if (start > end) {
    return { period: null, error: 'Period start must be on or before period end.', sourceCount: 0 }
  }

  const period = { start, end }
  const sourceCount = sources.filter((source) => isWithinInvoicePeriod(source.date, period)).length
  if (sourceCount === 0) {
    return {
      period: null,
      error: 'No approved, unbilled time or expenses fall within this period.',
      sourceCount,
    }
  }
  return { period, error: null, sourceCount }
}
