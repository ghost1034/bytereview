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

export function defaultVarianceConfig(uploadMode: VarianceUploadMode): VarianceConfig {
  return {
    name: 'New Variance Analysis',
    type: 'QoQ',
    thresholdDollar: 10_000,
    thresholdPercent: 10,
    logic: 'Either',
    accountType: 'Expense',
    analysisAnchors: ['Account'],
    positiveIs: 'Debit',
    basePeriodStart: '2025-07-01',
    basePeriodEnd: '2025-09-30',
    compPeriodStart: '2025-10-01',
    compPeriodEnd: '2025-12-31',
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
