import { describe, expect, it } from 'vitest'

import {
  currentVariancePeriodDefaults,
  inferVariancePeriodDefaults,
} from './varianceHelpers'

const AUGUST_17_2026 = new Date(2026, 7, 17)

describe('variance period defaults', () => {
  it('uses the latest two complete quarters relative to the current date', () => {
    expect(currentVariancePeriodDefaults('QoQ', AUGUST_17_2026)).toEqual({
      basePeriodStart: '2026-01-01',
      basePeriodEnd: '2026-03-31',
      compPeriodStart: '2026-04-01',
      compPeriodEnd: '2026-06-30',
    })
  })

  it('recalculates period length for monthly comparisons', () => {
    expect(currentVariancePeriodDefaults('MoM', AUGUST_17_2026)).toEqual({
      basePeriodStart: '2026-06-01',
      basePeriodEnd: '2026-06-30',
      compPeriodStart: '2026-07-01',
      compPeriodEnd: '2026-07-31',
    })
  })

  it('selects the latest two complete periods present in the mapped date column', () => {
    const rows = [
      { PostingDate: '2025-07-15' },
      { PostingDate: '2025-10-15' },
      { PostingDate: '2026-01-15' },
    ]

    expect(
      inferVariancePeriodDefaults('QoQ', rows, 'PostingDate', AUGUST_17_2026),
    ).toEqual({
      basePeriodStart: '2025-10-01',
      basePeriodEnd: '2025-12-31',
      compPeriodStart: '2026-01-01',
      compPeriodEnd: '2026-03-31',
    })
  })

  it('excludes an in-progress period from uploaded-data defaults', () => {
    const rows = [
      { Date: '2026-05-31' },
      { Date: '2026-06-30' },
      { Date: '2026-07-31' },
      { Date: '2026-08-01' },
    ]

    expect(inferVariancePeriodDefaults('MoM', rows, 'Date', AUGUST_17_2026)).toEqual({
      basePeriodStart: '2026-06-01',
      basePeriodEnd: '2026-06-30',
      compPeriodStart: '2026-07-01',
      compPeriodEnd: '2026-07-31',
    })
  })

  it('falls back to current calendar defaults when uploaded dates are insufficient', () => {
    expect(
      inferVariancePeriodDefaults(
        'YoY',
        [{ Date: 'not a date' }, { Date: '2025-12-31' }],
        'Date',
        AUGUST_17_2026,
      ),
    ).toEqual({
      basePeriodStart: '2024-01-01',
      basePeriodEnd: '2024-12-31',
      compPeriodStart: '2025-01-01',
      compPeriodEnd: '2025-12-31',
    })
  })
})
