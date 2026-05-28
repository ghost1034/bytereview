// Domain types + constants for the Waterfall module (revenue-recognition /
// deferral schedules). Ported from CPAAnalytics' Waterfall component, where
// these lived inline. The deterministic schedule + journal-entry math that
// consumes these types lives in `./waterfallEngine`.
//
// Storage note: a waterfall is persisted into the shared `analyses` row as
//   - row `type`     = "waterfall"   (NOT the subtype below)
//   - `config`       = WaterfallForm  (includes `type` = the WaterfallSubtype)
//   - `data`         = ScheduleRow[]
//   - `results`      = JournalEntry[]

export type WaterfallSubtype =
  | 'Deferred Revenue'
  | 'Prepaid Expenses'
  | 'Accrued Expenses'
  | 'Deferred Commission'

export type RecognitionMethod = 'Straight-Line' | 'Pro-Rata Daily'

export const WATERFALL_SUBTYPES: readonly WaterfallSubtype[] = [
  'Deferred Revenue',
  'Prepaid Expenses',
  'Accrued Expenses',
  'Deferred Commission',
] as const

export const RECOGNITION_METHODS: readonly RecognitionMethod[] = [
  'Straight-Line',
  'Pro-Rata Daily',
] as const

/** The waterfall configuration form — persisted verbatim into `analyses.config`. */
export interface WaterfallForm {
  type: WaterfallSubtype
  name: string
  partyName: string
  totalAmount: number
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  recognitionMethod: RecognitionMethod
  expenseCategory: string
  paymentDate: string
  expectedPaymentDate: string
  reversalMethod: string
  commissionType: string
  benefitPeriodMethod: string
  // Chart-of-accounts overrides (free text "<code> — <name>")
  deferredAccount: string
  revenueAccount: string
  prepaidAccount: string
  expenseAccount: string
  liabilityAccount: string
  defCommAccount: string
  commExpenseAccount: string
}

/** One row of a generated recognition schedule — persisted into `analyses.data`. */
export interface ScheduleRow {
  id: string
  period: string // e.g. "Jan 2026"
  billed: number
  cashReceived: number
  opening: number
  recognized: number
  closing: number
  cumulative: number
  remaining: number
}

/** One side of a double-entry journal entry — persisted into `analyses.results`. */
export interface JournalEntry {
  id: string
  date: string // YYYY-MM-DD
  account: string
  debit: number | null
  credit: number | null
  memo: string
}

/**
 * Subtype-specific expense-category presets used by the create/edit form's
 * Expense Category dropdown. Mirrors CPAAnalytics' `expenseCategoriesList`.
 * The "Other" entry surfaces a free-text input so users can type a custom
 * category — anything not in the preset list is treated as custom.
 */
export const EXPENSE_CATEGORY_OPTIONS: Record<
  'Prepaid Expenses' | 'Accrued Expenses',
  readonly string[]
> = {
  'Prepaid Expenses': ['Insurance', 'Software/Subscriptions', 'Rent', 'Maintenance', 'Other'],
  'Accrued Expenses': ['Bonuses', 'Payroll Taxes', 'Utilities', 'Professional Fees', 'Other'],
} as const

/** Default chart-of-accounts codes used when the form leaves an account blank. */
export const DEFAULT_ACCOUNTS = {
  deferredAccount: '2400 — Deferred Revenue',
  revenueAccount: '4100 — Revenue',
  prepaidAccount: '1350 — Prepaid Expenses',
  expenseAccount: '6350 — Expense',
  liabilityAccount: '2300 — Accrued Liability',
  defCommAccount: '1400 — Deferred Commission Costs',
  commExpenseAccount: '6400 — Commission Expense (Amortized)',
} as const

/**
 * Per-subtype sample prefill (name / party / amount), mirroring CPAAnalytics'
 * `handleTypeChange`. Useful for seeding the create form when a subtype is
 * selected; the UI may use or ignore these.
 */
export const SUBTYPE_SAMPLE_DEFAULTS: Record<
  WaterfallSubtype,
  { name: string; partyName: string; totalAmount: number }
> = {
  'Deferred Revenue': {
    name: 'Acme Corp — Annual SaaS License 2026',
    partyName: 'Acme Corp',
    totalAmount: 120000,
  },
  'Prepaid Expenses': {
    name: 'D&O Insurance Policy — 2026-2027',
    partyName: 'Travelers Insurance',
    totalAmount: 24000,
  },
  'Accrued Expenses': {
    name: 'Q1 2026 Employee Bonus Accrual',
    partyName: 'Employees',
    totalAmount: 120000,
  },
  'Deferred Commission': {
    name: 'John Smith — Acme Corp Deal Commission',
    partyName: 'John Smith',
    totalAmount: 12000,
  },
}

/** A fresh form seeded with the Deferred Revenue sample defaults. */
export function createDefaultWaterfallForm(): WaterfallForm {
  const sample = SUBTYPE_SAMPLE_DEFAULTS['Deferred Revenue']
  return {
    type: 'Deferred Revenue',
    name: sample.name,
    partyName: sample.partyName,
    totalAmount: sample.totalAmount,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    recognitionMethod: 'Straight-Line',
    expenseCategory: 'Insurance',
    paymentDate: '2026-01-01',
    expectedPaymentDate: '2027-03-15',
    reversalMethod: 'Reverse on Payment Date',
    commissionType: 'Initial Sale',
    benefitPeriodMethod: 'Contract Term',
    ...DEFAULT_ACCOUNTS,
  }
}
