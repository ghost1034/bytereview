/**
 * Variance analysis UI types — the in-memory shape of the data stored in the
 * `analyses` JSONB columns when `type='variance'`. Ported from
 * CPAAnalytics/src/types.ts with naming kept identical so the prompts + LLM
 * responses (which use these camelCase keys) round-trip cleanly.
 */

import type { AnalyticsAnalysis } from './types'

export type VarianceUploadMode = 'single' | 'dual'

export type VariancePeriodDefaultsSource = 'current-date' | 'uploaded-data' | 'user'

export type VarianceAnalysisType =
  | 'MoM'
  | 'QoQ'
  | 'YoY'
  | 'Actual vs Budget'
  | 'Actual vs Forecast'

export type VarianceLogic = 'Either' | 'Both'

export type VarianceAccountType =
  | 'Revenue'
  | 'Expense'
  | 'Asset'
  | 'Liability'
  | 'Equity'

export type VariancePositiveIs = 'Debit' | 'Credit'

export type VarianceWorkflowStatus = 'Draft' | 'In Review' | 'Approved' | 'Finalized'

export type VarianceRowStatus = 'Pending' | 'Accepted' | 'Edited' | 'Rejected'

export type VarianceConfidence = 'High' | 'Medium' | 'Low'

export type VarianceStep = 'upload' | 'mapping' | 'config' | 'review' | 'results'

export interface VarianceColumnMap {
  account?: string
  amount?: string
  period?: string
  description?: string
  department?: string
}

export interface VarianceConfig {
  name: string
  type: VarianceAnalysisType
  thresholdDollar: number
  thresholdPercent: number
  logic: VarianceLogic
  accountType: VarianceAccountType
  /** Grouping dimensions: always includes 'Account'; may include 'Department' and custom column names. */
  analysisAnchors: string[]
  positiveIs: VariancePositiveIs
  /** ISO date (YYYY-MM-DD) — used for single-mode period bucketing. */
  basePeriodStart: string
  basePeriodEnd: string
  compPeriodStart: string
  compPeriodEnd: string
  /** How single-file period dates were last chosen. Manual dates survive mapping changes. */
  periodDefaultsSource?: VariancePeriodDefaultsSource
  /** Upload mode chosen at creation: 'single' (one combined file) or 'dual' (two files). */
  uploadMode: VarianceUploadMode
  /** Canonical-field-name → uploaded-column-name. Persisted across steps. */
  columnMapping: VarianceColumnMap
  /** Display names of declared custom dimension columns (used as anchors / shown in detail panel). */
  customColumns: string[]
  /** Display-name → source-column-name for custom dimensions. */
  customColumnMapping: Record<string, string>
}

export interface VarianceData {
  id: string
  accountNumber?: string
  accountName: string
  accountType?: VarianceAccountType
  department?: string
  description?: string
  baseAmount: number
  compAmount: number
  variance: number
  variancePercent: number | 'N/M'
  absVariance: number
  absVariancePercent: number | 'N/M'
  /** null when account type isn't directional (e.g. anchor-only group). */
  isFavorable: boolean | null
  isFlagged: boolean
  explanation?: string
  confidence?: VarianceConfidence
  followUp?: string
  status: VarianceRowStatus
  customAttributes?: Record<string, unknown>
}

export interface VarianceAISuggestion {
  thresholdDollar: number
  thresholdPercent: number
  logic: VarianceLogic
  explanation: string
}

/**
 * Shape of `Analysis.data` JSONB for variance. After Upload step we store
 * `rawData` and `headers`; after Review we add `processed` (aggregated rows);
 * after Analyze we update individual `processed` rows with explanations.
 */
export interface VarianceRecordData {
  rawData?: Record<string, unknown>[]
  headers?: string[]
  processed?: VarianceData[]
}

/** Shape of `Analysis.results` JSONB — summary rollups used by Reports view. */
export interface VarianceRecordResults {
  totalRows: number
  flaggedCount: number
  reviewedCount: number
  totalAbsVariance: number
  topVarianceAccountName?: string
  topVarianceAmount?: number
}

export interface VarianceRecord extends AnalyticsAnalysis {
  type: 'variance'
}

/**
 * Read JSONB columns off an Analysis row with safe defaults. All fields are
 * optional in the schema (they fill in step-by-step), so callers can rely on
 * the shape without nullable juggling.
 */
export function readVarianceConfig(record: AnalyticsAnalysis | null | undefined): Partial<VarianceConfig> {
  return (record?.config as Partial<VarianceConfig> | null | undefined) ?? {}
}

export function readVarianceData(record: AnalyticsAnalysis | null | undefined): VarianceRecordData {
  return (record?.data as VarianceRecordData | null | undefined) ?? {}
}

export function readVarianceResults(
  record: AnalyticsAnalysis | null | undefined,
): VarianceRecordResults | null {
  return (record?.results as VarianceRecordResults | null | undefined) ?? null
}

/**
 * Derive which step of the 5-step editor a variance record is currently on.
 * Used by VarianceEditor's StepIndicator to gate forward navigation.
 */
export function deriveVarianceStep(record: AnalyticsAnalysis | null | undefined): VarianceStep {
  const data = readVarianceData(record)
  const config = readVarianceConfig(record)
  if (!data.rawData || data.rawData.length === 0) return 'upload'
  if (!config.columnMapping || !config.columnMapping.account || !config.columnMapping.amount) {
    return 'mapping'
  }
  if (!data.processed || data.processed.length === 0) {
    if (typeof config.thresholdDollar !== 'number') return 'config'
    return 'review'
  }
  return 'results'
}

export interface VarianceActiveSummary {
  id: string
  step: VarianceStep
  flaggedCount: number
  totalRows: number
  thresholdDollar?: number
  thresholdPercent?: number
}

export function summarizeVarianceRecord(record: AnalyticsAnalysis): VarianceActiveSummary {
  const data = readVarianceData(record)
  const config = readVarianceConfig(record)
  const processed = data.processed ?? []
  return {
    id: record.id,
    step: deriveVarianceStep(record),
    flaggedCount: processed.filter((r) => r.isFlagged).length,
    totalRows: processed.length,
    thresholdDollar: config.thresholdDollar,
    thresholdPercent: config.thresholdPercent,
  }
}
