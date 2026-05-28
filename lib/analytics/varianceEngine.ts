/**
 * Pure variance aggregation engine — ported verbatim from
 * `CPAAnalytics/src/components/modules/VarianceAnalysis.tsx::getAggregatedData`
 * (lines 572-746). No LLM calls, no React, no Firestore — given raw rows + a
 * column mapping + a config, returns the grouped + flagged variance rows.
 *
 * Behavior to preserve:
 *  - Anchor grouping (Account always implicit, plus Department + custom columns)
 *  - Dual mode keyed off `__role === 'Base Period' | 'Comparison Period'` markers
 *    that `DataUploadFlow` stamps onto rows
 *  - Single mode keyed off a parsed Period column (date range first, then string
 *    fallback "Q3/Base" vs "Q4/Comp"). The final synthetic 1.1× fallback in the
 *    source is preserved so demo CSVs without proper period columns still
 *    produce a result.
 *  - Variance % is `'N/M'` when baseAmount is 0 and compAmount isn't
 *  - Flagging: Either = OR, Both = AND
 *  - Favorability: Revenue/Liability/Equity favorable when variance > 0;
 *    Expense/Asset favorable when variance < 0; else null
 */

import type {
  VarianceConfig,
  VarianceData,
  VarianceColumnMap,
} from './varianceTypes'

function cleanNum(val: unknown): number {
  if (typeof val === 'number') return val
  if (val === null || val === undefined || val === '') return 0
  const cleaned = parseFloat(String(val).replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(cleaned) ? cleaned : 0
}

interface AggregationInput {
  rawData: Record<string, unknown>[]
  columnMap: VarianceColumnMap
  customColumns: string[]
  customColumnMapping: Record<string, string>
  config: Pick<
    VarianceConfig,
    | 'analysisAnchors'
    | 'accountType'
    | 'thresholdDollar'
    | 'thresholdPercent'
    | 'logic'
    | 'basePeriodStart'
    | 'basePeriodEnd'
    | 'compPeriodStart'
    | 'compPeriodEnd'
    | 'uploadMode'
  >
}

interface GroupAccumulator {
  id: string
  accountName: string
  accountType: VarianceData['accountType']
  department?: string
  description?: string
  baseAmount: number
  compAmount: number
  customAttributes: Record<string, unknown>
}

export function aggregateVariances(input: AggregationInput): VarianceData[] {
  const {
    rawData,
    columnMap,
    customColumns,
    customColumnMapping,
    config,
  } = input

  const anchors = config.analysisAnchors.length > 0 ? config.analysisAnchors : ['Account']
  const grouped: Record<string, GroupAccumulator> = {}

  for (const row of rawData) {
    const anchorValues: Record<string, string> = {}
    const keys = anchors.map((anchor) => {
      let val = 'Unassigned'
      if (anchor === 'Account') {
        const mappedVal = columnMap.account ? (row[columnMap.account] as unknown) : null
        if (mappedVal !== null && mappedVal !== undefined && mappedVal !== '') {
          val = String(mappedVal)
        } else {
          const altMatch = Object.keys(row).find(
            (k) => k.toLowerCase().includes('account') || k.toLowerCase().includes('name'),
          )
          if (altMatch && row[altMatch]) val = String(row[altMatch])
          else val = String(row.accountName ?? row.account ?? 'Unknown Account')
        }
      } else if (anchor === 'Department' || anchor === 'Class') {
        const mappedVal = columnMap.department ? (row[columnMap.department] as unknown) : null
        if (mappedVal !== null && mappedVal !== undefined && mappedVal !== '') {
          val = String(mappedVal)
        } else {
          const altMatch = Object.keys(row).find(
            (k) => k.toLowerCase().includes('dept') || k.toLowerCase().includes('class'),
          )
          if (altMatch && row[altMatch]) val = String(row[altMatch])
          else val = String(row.department ?? row.class ?? 'Unassigned')
        }
      } else {
        const sourceCol = customColumnMapping[anchor]
        if (sourceCol && row[sourceCol]) {
          val = String(row[sourceCol])
        } else {
          const directMatch = Object.keys(row).find((k) => {
            const key = k.toLowerCase()
            const target = anchor.toLowerCase()
            return key === target || key.includes(target) || target.includes(key)
          })
          if (directMatch && row[directMatch]) val = String(row[directMatch])
          else if (anchor === 'Location' && row.location) val = String(row.location)
        }
      }
      anchorValues[anchor] = val
      return val
    })

    const groupKey = keys.join(' - ')

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        id: `anchor-${groupKey}`,
        accountName: anchorValues['Account'] || groupKey,
        accountType: config.accountType,
        department: anchors.includes('Department') ? anchorValues['Department'] : 'Multiple',
        description: columnMap.description
          ? (row[columnMap.description] as string | undefined) || ''
          : (row.description as string | undefined) || '',
        baseAmount: 0,
        compAmount: 0,
        customAttributes: customColumns.reduce<Record<string, unknown>>((acc, col) => {
          const sourceCol = customColumnMapping[col]
          if (sourceCol && row[sourceCol]) acc[col] = row[sourceCol]
          return acc
        }, {}),
      }
    }

    const amt = cleanNum(columnMap.amount ? row[columnMap.amount] : undefined)

    // Backfill custom attrs from the first row of the group that has them
    for (const col of customColumns) {
      const sourceCol = customColumnMapping[col]
      if (sourceCol && row[sourceCol] && grouped[groupKey].customAttributes[col] === undefined) {
        grouped[groupKey].customAttributes[col] = row[sourceCol]
      }
    }

    if (config.uploadMode === 'single') {
      const periodVal = columnMap.period
        ? (row[columnMap.period] as string | undefined)
        : ((row.Period as string | undefined) ?? (row.Date as string | undefined))

      const rowDate = periodVal ? new Date(periodVal) : new Date(Number.NaN)
      if (!Number.isNaN(rowDate.getTime())) {
        const baseStart = new Date(config.basePeriodStart)
        const baseEnd = new Date(config.basePeriodEnd)
        const compStart = new Date(config.compPeriodStart)
        const compEnd = new Date(config.compPeriodEnd)

        if (rowDate >= baseStart && rowDate <= baseEnd) {
          grouped[groupKey].baseAmount += amt
        } else if (rowDate >= compStart && rowDate <= compEnd) {
          grouped[groupKey].compAmount += amt
        } else if (typeof periodVal === 'string' && (periodVal.includes('Q3') || periodVal.includes('Base'))) {
          grouped[groupKey].baseAmount += amt
        } else if (typeof periodVal === 'string' && (periodVal.includes('Q4') || periodVal.includes('Comp'))) {
          grouped[groupKey].compAmount += amt
        }
      } else if (typeof periodVal === 'string' && (periodVal.includes('Q3') || periodVal.includes('Base'))) {
        grouped[groupKey].baseAmount += amt
      } else if (typeof periodVal === 'string' && (periodVal.includes('Q4') || periodVal.includes('Comp'))) {
        grouped[groupKey].compAmount += amt
      } else {
        // Fallback for demo data with no period column at all — mirrors source behavior.
        grouped[groupKey].baseAmount += amt
        grouped[groupKey].compAmount += amt * 1.1
      }
    } else {
      const role = (row as Record<string, unknown>).__role
      if (role === 'Base Period') {
        grouped[groupKey].baseAmount += amt
      } else if (role === 'Comparison Period') {
        grouped[groupKey].compAmount += amt
      } else {
        grouped[groupKey].baseAmount += amt
        grouped[groupKey].compAmount += amt * 1.1
      }
    }
  }

  return Object.values(grouped).map((g) => {
    const variance = g.compAmount - g.baseAmount
    const absVariance = Math.abs(variance)
    let variancePercent: number | 'N/M' = 0
    let absVariancePercent: number | 'N/M' = 0

    if (g.baseAmount === 0 && g.compAmount !== 0) {
      variancePercent = 'N/M'
      absVariancePercent = 'N/M'
    } else if (g.baseAmount !== 0) {
      variancePercent = (variance / Math.abs(g.baseAmount)) * 100
      absVariancePercent = Math.abs(variancePercent)
    }

    const exceedsDollar = absVariance >= config.thresholdDollar
    const exceedsPercent =
      absVariancePercent !== 'N/M' && absVariancePercent >= config.thresholdPercent
    const isFlagged =
      config.logic === 'Either' ? exceedsDollar || exceedsPercent : exceedsDollar && exceedsPercent

    const accountType = config.accountType
    let isFavorable: boolean | null = null
    if (accountType === 'Revenue' || accountType === 'Liability' || accountType === 'Equity') {
      isFavorable = variance > 0
    } else if (accountType === 'Expense' || accountType === 'Asset') {
      isFavorable = variance < 0
    }

    return {
      id: g.id,
      accountName: g.accountName,
      accountType,
      department: g.department,
      description: g.description,
      baseAmount: g.baseAmount,
      compAmount: g.compAmount,
      variance,
      absVariance,
      variancePercent,
      absVariancePercent,
      isFavorable,
      isFlagged,
      status: 'Pending',
      customAttributes: g.customAttributes,
    }
  })
}

/** Summarize processed rows for the `results` JSONB column. */
export function summarizeProcessed(processed: VarianceData[]) {
  const flagged = processed.filter((r) => r.isFlagged)
  const reviewed = processed.filter((r) => r.status !== 'Pending')
  const totalAbsVariance = processed.reduce((sum, r) => sum + r.absVariance, 0)
  const top = [...processed].sort((a, b) => b.absVariance - a.absVariance)[0]
  return {
    totalRows: processed.length,
    flaggedCount: flagged.length,
    reviewedCount: reviewed.length,
    totalAbsVariance,
    topVarianceAccountName: top?.accountName,
    topVarianceAmount: top?.absVariance,
  }
}
