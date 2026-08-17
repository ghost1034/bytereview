import { describe, expect, it } from 'vitest'

import { aggregateVariancesWithStats } from './varianceEngine'
import type { VarianceConfig } from './varianceTypes'

const config: VarianceConfig = {
  name: 'Period classification',
  type: 'MoM',
  thresholdDollar: 1,
  thresholdPercent: 1,
  logic: 'Either',
  accountType: 'Expense',
  analysisAnchors: ['Account', 'Department'],
  positiveIs: 'Debit',
  basePeriodStart: '2025-01-01',
  basePeriodEnd: '2025-01-31',
  compPeriodStart: '2025-02-01',
  compPeriodEnd: '2025-02-28',
  uploadMode: 'single',
  columnMapping: {
    account: 'Account',
    amount: 'Amount',
    period: 'Date',
    department: 'Department',
  },
  customColumns: [],
  customColumnMapping: {},
}

describe('aggregateVariancesWithStats', () => {
  it('excludes out-of-period rows before creating groups', () => {
    const result = aggregateVariancesWithStats({
      rawData: [
        { Account: 'Travel', Department: 'Sales', Amount: 100, Date: '2026-01-05' },
        { Account: 'Meals', Department: 'Sales', Amount: 50, Date: '2026-01-06' },
      ],
      columnMap: config.columnMapping,
      customColumns: [],
      customColumnMapping: {},
      config,
    })

    expect(result.variances).toEqual([])
    expect(result.rowCounts).toEqual({
      baseRows: 0,
      comparisonRows: 0,
      excludedRows: 2,
    })
  })

  it('counts selected-period rows and aggregates only those rows', () => {
    const result = aggregateVariancesWithStats({
      rawData: [
        { Account: 'Travel', Department: 'Sales', Amount: 100, Date: '2025-01-05' },
        { Account: 'Travel', Department: 'Sales', Amount: 140, Date: '2025-02-05' },
        { Account: 'Travel', Department: 'Sales', Amount: 999, Date: '2026-01-05' },
      ],
      columnMap: config.columnMapping,
      customColumns: [],
      customColumnMapping: {},
      config,
    })

    expect(result.rowCounts).toEqual({
      baseRows: 1,
      comparisonRows: 1,
      excludedRows: 1,
    })
    expect(result.variances).toHaveLength(1)
    expect(result.variances[0]).toMatchObject({
      accountName: 'Travel',
      department: 'Sales',
      baseAmount: 100,
      compAmount: 140,
      variance: 40,
    })
  })

  it('includes timestamps on period end dates and Excel serial dates', () => {
    const result = aggregateVariancesWithStats({
      rawData: [
        { Account: 'Travel', Department: 'Sales', Amount: 100, Date: '2025-01-31T23:59:59Z' },
        { Account: 'Travel', Department: 'Sales', Amount: 140, Date: 45716 },
      ],
      columnMap: config.columnMapping,
      customColumns: [],
      customColumnMapping: {},
      config,
    })

    expect(result.rowCounts).toEqual({
      baseRows: 1,
      comparisonRows: 1,
      excludedRows: 0,
    })
    expect(result.variances[0]).toMatchObject({ baseAmount: 100, compAmount: 140 })
  })

  it('excludes dual-upload rows without a recognized period role', () => {
    const result = aggregateVariancesWithStats({
      rawData: [
        { Account: 'Travel', Amount: 100, __role: 'Base Period' },
        { Account: 'Travel', Amount: 140, __role: 'Comparison Period' },
        { Account: 'Meals', Amount: 50 },
      ],
      columnMap: config.columnMapping,
      customColumns: [],
      customColumnMapping: {},
      config: { ...config, uploadMode: 'dual' },
    })

    expect(result.rowCounts).toEqual({
      baseRows: 1,
      comparisonRows: 1,
      excludedRows: 1,
    })
    expect(result.variances).toHaveLength(1)
  })
})
