import { describe, expect, it } from 'vitest'
import { invoicePeriodDefaults, isValidInvoiceDate, normalizeInvoicePeriod } from './invoicePeriod'

describe('invoice period', () => {
  const sources = [{ date: '2026-07-31' }, { date: '2026-08-10' }, { date: '2026-08-03' }]

  it('defaults to the full date range of the selected sources', () => {
    expect(invoicePeriodDefaults(sources, '2026-08-17')).toEqual({
      start: '2026-07-31',
      end: '2026-08-10',
    })
  })

  it('defaults to the billing month when there are no selected sources', () => {
    expect(invoicePeriodDefaults([], '2024-02-15')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    })
  })

  it('requires real, ordered dates containing at least one source', () => {
    expect(isValidInvoiceDate('2026-02-29')).toBe(false)
    expect(normalizeInvoicePeriod('', '2026-08-31', sources).error).toBe('Select a period start date.')
    expect(normalizeInvoicePeriod('2026-08-31', '2026-08-01', sources).error).toBe(
      'Period start must be on or before period end.',
    )
    expect(normalizeInvoicePeriod('2026-09-01', '2026-09-30', sources).error).toBe(
      'No approved, unbilled time or expenses fall within this period.',
    )
  })

  it('returns one normalized period and its matching source count', () => {
    expect(normalizeInvoicePeriod('2026-08-01', '2026-08-31', sources)).toEqual({
      period: { start: '2026-08-01', end: '2026-08-31' },
      error: null,
      sourceCount: 2,
    })
  })
})
