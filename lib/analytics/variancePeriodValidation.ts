import type { VarianceColumnMap, VarianceConfig } from './varianceTypes'
import { parseVariancePeriodDate } from './varianceHelpers'

type VariancePeriods = Pick<
  VarianceConfig,
  | 'uploadMode'
  | 'basePeriodStart'
  | 'basePeriodEnd'
  | 'compPeriodStart'
  | 'compPeriodEnd'
>

export interface VariancePeriodValidationResult {
  isValid: boolean
  error: string | null
  baseRowCount: number
  comparisonRowCount: number
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return timestamp
}

function parseUploadedDate(value: unknown): number | null {
  return parseVariancePeriodDate(value)?.getTime() ?? null
}

function invalid(error: string): VariancePeriodValidationResult {
  return { isValid: false, error, baseRowCount: 0, comparisonRowCount: 0 }
}

/**
 * Validate single-file period ranges against the uploaded rows. Dual-file
 * analyses use the role stamped onto each row and do not need date ranges.
 */
export function validateVariancePeriods({
  config,
  rawData,
  columnMap,
}: {
  config: VariancePeriods
  rawData: Record<string, unknown>[]
  columnMap: VarianceColumnMap
}): VariancePeriodValidationResult {
  if (config.uploadMode !== 'single') {
    return { isValid: true, error: null, baseRowCount: 0, comparisonRowCount: 0 }
  }

  const dateFields: Array<[label: string, value: unknown]> = [
    ['Base start', config.basePeriodStart],
    ['Base end', config.basePeriodEnd],
    ['Comparison start', config.compPeriodStart],
    ['Comparison end', config.compPeriodEnd],
  ]

  for (const [label, value] of dateFields) {
    if (typeof value !== 'string' || value === '') {
      return invalid(`${label} date is required.`)
    }
    if (parseIsoDate(value) === null) {
      return invalid(`${label} must be a valid date.`)
    }
  }

  const baseStart = parseIsoDate(config.basePeriodStart) as number
  const baseEnd = parseIsoDate(config.basePeriodEnd) as number
  const comparisonStart = parseIsoDate(config.compPeriodStart) as number
  const comparisonEnd = parseIsoDate(config.compPeriodEnd) as number

  if (baseStart > baseEnd) {
    return invalid('Base period start must be on or before its end date.')
  }
  if (comparisonStart > comparisonEnd) {
    return invalid('Comparison period start must be on or before its end date.')
  }
  if (baseStart <= comparisonEnd && comparisonStart <= baseEnd) {
    return invalid('Base and comparison periods cannot overlap.')
  }

  let baseRowCount = 0
  let comparisonRowCount = 0

  for (const row of rawData) {
    const value = columnMap.period ? row[columnMap.period] : (row.Period ?? row.Date)
    const rowDate = parseUploadedDate(value)
    if (rowDate === null) continue

    if (rowDate >= baseStart && rowDate <= baseEnd) baseRowCount += 1
    if (rowDate >= comparisonStart && rowDate <= comparisonEnd) comparisonRowCount += 1
  }

  if (baseRowCount === 0) {
    return {
      isValid: false,
      error: 'Base period contains no uploaded rows. Choose a range covered by the uploaded data.',
      baseRowCount,
      comparisonRowCount,
    }
  }
  if (comparisonRowCount === 0) {
    return {
      isValid: false,
      error:
        'Comparison period contains no uploaded rows. Choose a range covered by the uploaded data.',
      baseRowCount,
      comparisonRowCount,
    }
  }

  return { isValid: true, error: null, baseRowCount, comparisonRowCount }
}
