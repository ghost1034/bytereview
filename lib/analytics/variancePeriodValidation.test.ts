import { describe, expect, it } from 'vitest'

import { validateVariancePeriods } from './variancePeriodValidation'
import type { VarianceConfig } from './varianceTypes'

const periods: Pick<
  VarianceConfig,
  | 'uploadMode'
  | 'basePeriodStart'
  | 'basePeriodEnd'
  | 'compPeriodStart'
  | 'compPeriodEnd'
> = {
  uploadMode: 'single',
  basePeriodStart: '2026-01-01',
  basePeriodEnd: '2026-01-31',
  compPeriodStart: '2026-02-01',
  compPeriodEnd: '2026-02-28',
}

const rows = [{ PostingDate: '2026-01-15' }, { PostingDate: '2026-02-15' }]

function validate(
  overrides: Partial<typeof periods> = {},
  rawData: Record<string, unknown>[] = rows,
) {
  return validateVariancePeriods({
    config: { ...periods, ...overrides },
    rawData,
    columnMap: { period: 'PostingDate' },
  })
}

describe('validateVariancePeriods', () => {
  it('accepts non-overlapping ranges that each contain an uploaded row', () => {
    expect(validate()).toEqual({
      isValid: true,
      error: null,
      baseRowCount: 1,
      comparisonRowCount: 1,
    })
  })

  it('counts timestamped rows that occur on a period end date', () => {
    const result = validate({}, [
      { PostingDate: '2026-01-31T18:30:00Z' },
      { PostingDate: '2026-02-28T23:59:59Z' },
    ])

    expect(result.isValid).toBe(true)
  })

  it('counts Excel serial dates from spreadsheet uploads', () => {
    const result = validate({}, [
      { PostingDate: 46037 },
      { PostingDate: 46068 },
    ])

    expect(result.isValid).toBe(true)
  })

  it('requires all four dates and rejects invalid calendar dates', () => {
    expect(validate({ basePeriodStart: '' }).error).toBe('Base start date is required.')
    expect(validate({ compPeriodEnd: '2026-02-30' }).error).toBe(
      'Comparison end must be a valid date.',
    )
  })

  it('rejects reversed ranges', () => {
    expect(validate({ basePeriodStart: '2026-02-01' }).error).toBe(
      'Base period start must be on or before its end date.',
    )
    expect(validate({ compPeriodEnd: '2026-01-31' }).error).toBe(
      'Comparison period start must be on or before its end date.',
    )
  })

  it('rejects periods that overlap, including a shared boundary date', () => {
    expect(validate({ compPeriodStart: '2026-01-31' }).error).toBe(
      'Base and comparison periods cannot overlap.',
    )
  })

  it('reports which period has no uploaded rows', () => {
    expect(validate({}, [{ PostingDate: '2026-02-15' }]).error).toContain(
      'Base period contains no uploaded rows',
    )
    expect(validate({}, [{ PostingDate: '2026-01-15' }]).error).toContain(
      'Comparison period contains no uploaded rows',
    )
  })

  it('uses conventional Period and Date columns when no period column is mapped', () => {
    const result = validateVariancePeriods({
      config: periods,
      rawData: [{ Date: '2026-01-15' }, { Period: '2026-02-15' }],
      columnMap: {},
    })

    expect(result.isValid).toBe(true)
  })

  it('does not apply date-range validation to dual-file uploads', () => {
    expect(validate({ uploadMode: 'dual', basePeriodStart: '' }, [])).toEqual({
      isValid: true,
      error: null,
      baseRowCount: 0,
      comparisonRowCount: 0,
    })
  })
})
