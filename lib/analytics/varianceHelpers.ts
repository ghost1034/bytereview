/**
 * Defaults, presets, and a small mock GL fixture for the variance module.
 * Mock data is for empty-state demo only — actual analyses use uploaded files.
 */

import type {
  VarianceAccountType,
  VarianceAnalysisType,
  VarianceConfig,
  VarianceLogic,
  VarianceUploadMode,
} from './varianceTypes'

export const ANALYSIS_TYPE_OPTIONS: VarianceAnalysisType[] = [
  'MoM',
  'QoQ',
  'YoY',
  'Actual vs Budget',
  'Actual vs Forecast',
]

export const ACCOUNT_TYPE_OPTIONS: VarianceAccountType[] = [
  'Expense',
  'Revenue',
  'Asset',
  'Liability',
  'Equity',
]

export const LOGIC_OPTIONS: { value: VarianceLogic; label: string; hint: string }[] = [
  { value: 'Either', label: 'Either ($ OR %)', hint: 'Flag if EITHER threshold is exceeded.' },
  { value: 'Both', label: 'Both ($ AND %)', hint: 'Flag only if BOTH thresholds are exceeded.' },
]

export interface VariancePeriodDefaults {
  basePeriodStart: string
  basePeriodEnd: string
  compPeriodStart: string
  compPeriodEnd: string
}

interface CalendarPeriod {
  start: Date
  end: Date
}

type CalendarPeriodUnit = 'month' | 'quarter' | 'year'

function periodUnit(type: VarianceAnalysisType): CalendarPeriodUnit {
  if (type === 'MoM') return 'month'
  if (type === 'QoQ') return 'quarter'
  return 'year'
}

function calendarPeriod(date: Date, unit: CalendarPeriodUnit): CalendarPeriod {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()

  if (unit === 'month') {
    return {
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 0)),
    }
  }

  if (unit === 'quarter') {
    const startMonth = Math.floor(month / 3) * 3
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 0)),
    }
  }

  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 12, 0)),
  }
}

function previousCalendarPeriod(period: CalendarPeriod, unit: CalendarPeriodUnit): CalendarPeriod {
  const previousDate = new Date(period.start)
  if (unit === 'month') previousDate.setUTCMonth(previousDate.getUTCMonth() - 1)
  else if (unit === 'quarter') previousDate.setUTCMonth(previousDate.getUTCMonth() - 3)
  else previousDate.setUTCFullYear(previousDate.getUTCFullYear() - 1)
  return calendarPeriod(previousDate, unit)
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toVariancePeriodDefaults(base: CalendarPeriod, comparison: CalendarPeriod): VariancePeriodDefaults {
  return {
    basePeriodStart: formatDate(base.start),
    basePeriodEnd: formatDate(base.end),
    compPeriodStart: formatDate(comparison.start),
    compPeriodEnd: formatDate(comparison.end),
  }
}

export function parseVariancePeriodDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // XLSX may leave date cells as Excel serial values.
    if (value > 0 && value < 100_000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    }
    const timestamp = new Date(value)
    return Number.isNaN(timestamp.getTime())
      ? null
      : new Date(Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate()))
  }

  if (typeof value !== 'string' || !value.trim()) return null
  const input = value.trim()
  const dateOnly = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (dateOnly) {
    const [, rawYear, rawMonth, rawDay] = dateOnly
    const year = Number(rawYear)
    const month = Number(rawMonth)
    const day = Number(rawDay)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null
    }
    return parsed
  }

  const quarter = input.match(/^(?:Q([1-4])\s*[-/]?\s*(\d{4})|(\d{4})\s*[-/]?\s*Q([1-4]))$/i)
  if (quarter) {
    const year = Number(quarter[2] ?? quarter[3])
    const quarterNumber = Number(quarter[1] ?? quarter[4])
    return new Date(Date.UTC(year, (quarterNumber - 1) * 3, 1))
  }

  const timestamp = Date.parse(input)
  if (Number.isNaN(timestamp)) return null
  const parsed = new Date(timestamp)
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

/** Return the latest two completed calendar periods relative to today. */
export function currentVariancePeriodDefaults(
  type: VarianceAnalysisType,
  now: Date = new Date(),
): VariancePeriodDefaults {
  const unit = periodUnit(type)
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const current = calendarPeriod(today, unit)
  const comparison = previousCalendarPeriod(current, unit)
  const base = previousCalendarPeriod(comparison, unit)
  return toVariancePeriodDefaults(base, comparison)
}

/**
 * Prefer the latest two completed periods represented in a single-file upload.
 * If the mapped column has fewer than two completed periods, use calendar defaults.
 */
export function inferVariancePeriodDefaults(
  type: VarianceAnalysisType,
  rows: Record<string, unknown>[],
  dateColumn: string | undefined,
  now: Date = new Date(),
): VariancePeriodDefaults {
  if (!dateColumn) return currentVariancePeriodDefaults(type, now)

  const unit = periodUnit(type)
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const periods = new Map<string, CalendarPeriod>()

  for (const row of rows) {
    const parsed = parseVariancePeriodDate(row[dateColumn])
    if (!parsed) continue
    const period = calendarPeriod(parsed, unit)
    if (period.end >= today) continue
    periods.set(formatDate(period.start), period)
  }

  const available = Array.from(periods.values()).sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  )
  if (available.length < 2) return currentVariancePeriodDefaults(type, now)

  return toVariancePeriodDefaults(
    available[available.length - 2],
    available[available.length - 1],
  )
}

export function defaultVarianceConfig(uploadMode: VarianceUploadMode): VarianceConfig {
  const periods = currentVariancePeriodDefaults('QoQ')
  return {
    name: 'New Variance Analysis',
    type: 'QoQ',
    thresholdDollar: 10_000,
    thresholdPercent: 10,
    logic: 'Either',
    accountType: 'Expense',
    analysisAnchors: ['Account'],
    positiveIs: 'Debit',
    ...periods,
    periodDefaultsSource: 'current-date',
    uploadMode,
    columnMapping: {},
    customColumns: [],
    customColumnMapping: {},
  }
}

export const WORKFLOW_TRANSITIONS: Record<string, { next?: string; rollback?: string; label: string }> = {
  Draft: { next: 'In Review', label: 'Submit for review' },
  'In Review': { next: 'Approved', rollback: 'Draft', label: 'Approve' },
  Approved: { next: 'Finalized', label: 'Finalize' },
  Finalized: { label: 'Finalized' },
}

export const WORKFLOW_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  Draft: 'secondary',
  'In Review': 'outline',
  Approved: 'default',
  Finalized: 'default',
}

/** Rows below materiality thresholds do not require review or explanation. */
export function requiresVarianceExplanation(row: { isFlagged: boolean }): boolean {
  return row.isFlagged
}

export function initialVarianceRowStatus(isFlagged: boolean): 'Pending' | 'Accepted' {
  return isFlagged ? 'Pending' : 'Accepted'
}

/** Count rows that are either below threshold or have completed review. */
export function countReviewedVarianceRows(rows: { isFlagged: boolean; status: string }[]): number {
  return rows.filter((row) => !requiresVarianceExplanation(row) || row.status !== 'Pending').length
}

/**
 * Mock GL fixture (used by the New Analysis dialog "Load sample data" option).
 * Sums roll up to recognizable Q3→Q4 deltas so the engine produces a non-empty
 * variance table without an upload.
 */
export const MOCK_GL_DATA: Record<string, unknown>[] = [
  { 'Account Name': '6000-01 Salaries', Amount: 200_000, Date: '2025-07-15', Department: 'Operations' },
  { 'Account Name': '6000-01 Salaries', Amount: 215_000, Date: '2025-10-15', Department: 'Operations' },
  { 'Account Name': '6100-02 Marketing', Amount: 45_000, Date: '2025-08-01', Department: 'Marketing' },
  { 'Account Name': '6100-02 Marketing', Amount: 72_000, Date: '2025-11-01', Department: 'Marketing' },
  { 'Account Name': '6200-03 Travel', Amount: 8_500, Date: '2025-08-20', Department: 'Sales' },
  { 'Account Name': '6200-03 Travel', Amount: 6_200, Date: '2025-11-20', Department: 'Sales' },
  { 'Account Name': '6300-04 Office Supplies', Amount: 3_200, Date: '2025-09-10', Department: 'Operations' },
  { 'Account Name': '6300-04 Office Supplies', Amount: 3_400, Date: '2025-12-10', Department: 'Operations' },
  { 'Account Name': '7000-01 Software Subs', Amount: 22_000, Date: '2025-07-01', Department: 'Engineering' },
  { 'Account Name': '7000-01 Software Subs', Amount: 34_500, Date: '2025-10-01', Department: 'Engineering' },
  { 'Account Name': '7100-02 Professional Fees', Amount: 18_000, Date: '2025-09-05', Department: 'Finance' },
  { 'Account Name': '7100-02 Professional Fees', Amount: 12_500, Date: '2025-12-05', Department: 'Finance' },
  { 'Account Name': '8000-01 Rent', Amount: 30_000, Date: '2025-07-01', Department: 'Operations' },
  { 'Account Name': '8000-01 Rent', Amount: 30_000, Date: '2025-10-01', Department: 'Operations' },
  { 'Account Name': '8100-02 Utilities', Amount: 4_800, Date: '2025-08-15', Department: 'Operations' },
  { 'Account Name': '8100-02 Utilities', Amount: 5_900, Date: '2025-11-15', Department: 'Operations' },
]

export const MOCK_GL_HEADERS = ['Account Name', 'Amount', 'Date', 'Department']
