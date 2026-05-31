// Domain types + constants for the Amortization module (assets, leases,
// loans, intangibles, software, MACRS tax depreciation). Ported from
// CPAAnalytics' Amortization component, where these lived inline. The
// deterministic schedule math lives on the backend (amortization_math.py);
// thin frontend-only derivations live in `./amortizationHelpers`.
//
// Storage note: an amortization row maps a small fixed set of fields to
// first-class columns on the `amortizations` table; everything else is
// stored under the `type_specific` JSONB blob. See `splitFormForApi` in
// amortizationHelpers.ts for the partition.

// ---------------------------------------------------------------------------
// Asset types
// ---------------------------------------------------------------------------

export type AssetType =
  | 'Prepaid Expenses'
  | 'Lease - Operating'
  | 'Lease - Finance'
  | 'Intangible Assets'
  | 'Fixed Assets — Machinery & Equipment'
  | 'Fixed Assets — Furniture & Fixtures'
  | 'Fixed Assets — Vehicles'
  | 'Fixed Assets — Computer & IT Equipment'
  | 'Fixed Assets — Buildings & Improvements'
  | 'Fixed Assets — Land Improvements'
  | 'Fixed Assets — Leasehold Improvements'
  | 'Loan Amortization'
  | 'Software Costs'
  | 'Debt Issuance Costs'
  | 'Deferred Financing Fees'

export const ASSET_TYPES: readonly AssetType[] = [
  'Prepaid Expenses',
  'Lease - Operating',
  'Lease - Finance',
  'Intangible Assets',
  'Fixed Assets — Machinery & Equipment',
  'Fixed Assets — Furniture & Fixtures',
  'Fixed Assets — Vehicles',
  'Fixed Assets — Computer & IT Equipment',
  'Fixed Assets — Buildings & Improvements',
  'Fixed Assets — Land Improvements',
  'Fixed Assets — Leasehold Improvements',
  'Loan Amortization',
  'Software Costs',
  'Debt Issuance Costs',
  'Deferred Financing Fees',
] as const

/** Per-asset-type sample prefill used when the user picks a fresh type. */
export const ASSET_TYPE_DEFAULTS: Record<
  AssetType,
  { assetName: string; department: string; vendor: string }
> = {
  'Prepaid Expenses': { assetName: 'Annual Insurance Premium', department: 'Operations', vendor: 'Geico' },
  'Lease - Operating': { assetName: 'Office Space Lease', department: 'Operations', vendor: 'WeWork' },
  'Lease - Finance': { assetName: 'Equipment Lease', department: 'Operations', vendor: 'Caterpillar' },
  'Intangible Assets': { assetName: 'Patent Application', department: 'Operations', vendor: 'USPTO' },
  'Fixed Assets — Machinery & Equipment': { assetName: 'CNC Machine', department: 'Operations', vendor: 'Haas' },
  'Fixed Assets — Furniture & Fixtures': { assetName: 'Office Desks', department: 'Operations', vendor: 'Herman Miller' },
  'Fixed Assets — Vehicles': { assetName: 'Delivery Van', department: 'Operations', vendor: 'Ford' },
  'Fixed Assets — Computer & IT Equipment': { assetName: 'Developer Laptops', department: 'IT', vendor: 'Apple' },
  'Fixed Assets — Buildings & Improvements': { assetName: 'Warehouse Expansion', department: 'Operations', vendor: 'Turner Construction' },
  'Fixed Assets — Land Improvements': { assetName: 'Parking Lot Paving', department: 'Operations', vendor: 'Local Paving Co' },
  'Fixed Assets — Leasehold Improvements': { assetName: 'Office Remodel', department: 'Operations', vendor: 'Local Contractor' },
  'Loan Amortization': { assetName: 'Business Loan', department: 'Finance', vendor: 'Chase Bank' },
  'Software Costs': { assetName: 'Enterprise CRM License', department: 'IT', vendor: 'Salesforce' },
  'Debt Issuance Costs': { assetName: 'Bond Issuance Fees', department: 'Finance', vendor: 'Goldman Sachs' },
  'Deferred Financing Fees': { assetName: 'Loan Fees', department: 'Finance', vendor: 'Wells Fargo' },
}

// ---------------------------------------------------------------------------
// Method enums
// ---------------------------------------------------------------------------

export type GaapMethod = 'Straight-Line'

export const GAAP_METHODS: readonly GaapMethod[] = ['Straight-Line'] as const

export type TaxMethod = 'MACRS' | 'Straight-Line'

export const TAX_METHODS: readonly TaxMethod[] = ['MACRS', 'Straight-Line'] as const

/** Wire-format method strings accepted by `POST /amortization/schedule`. */
export type ScheduleMethodKey =
  | 'straight_line'
  | 'declining_balance'
  | 'loan'
  | 'operating_lease'
  | 'finance_lease'
  | 'macrs'

export type MacrsPropertyClass =
  | '3-year'
  | '5-year'
  | '7-year'
  | '10-year'
  | '15-year'
  | '20-year'
  | '27.5-year'
  | '39-year'

export const MACRS_PROPERTY_CLASSES: readonly MacrsPropertyClass[] = [
  '3-year',
  '5-year',
  '7-year',
  '10-year',
  '15-year',
  '20-year',
  '27.5-year',
  '39-year',
] as const

export type LeaseClassification = 'Operating' | 'Finance'

export type PaymentFrequency = 'Monthly' | 'Quarterly' | 'Semi-Annually' | 'Annually'

export type PaymentTiming = 'Beginning of Period' | 'End of Period'

export type PhysicalCondition = 'New' | 'Used' | 'Refurbished' | 'Damaged'

export type IntangibleType =
  | 'Patent'
  | 'Trademark'
  | 'Copyright'
  | 'Goodwill'
  | 'Customer List'
  | 'Other'

export type SoftwareStage =
  | 'Preliminary'
  | 'Application Development'
  | 'Post-Implementation'

export type AmortizationLifecycleStatus = 'Active' | 'Disposed' | 'Impaired' | 'Fully Depreciated'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type PersistenceStatus = 'draft' | 'published'

// ---------------------------------------------------------------------------
// The form — superset of every field the UI may collect for any asset type.
// Most fields are optional in practice; required ones are asset_name and
// asset_type. `splitFormForApi` partitions this into first-class DB columns
// vs the `type_specific` JSONB blob.
// ---------------------------------------------------------------------------

export interface AmortizationForm {
  id?: string

  // Common
  assetName: string
  assetType: AssetType | string
  assetTag?: string
  clientEntity?: string
  department?: string
  location?: string
  vendor?: string
  poNumber?: string
  description?: string

  // Financial (first-class columns on the row)
  costBasis: number
  salvageValue: number
  startDate: string // YYYY-MM-DD
  endDate?: string
  usefulLifeMonths: number
  gaapMethod: GaapMethod | string
  taxMethod: TaxMethod | string
  status: AmortizationLifecycleStatus | string
  approvalStatus?: ApprovalStatus
  persistenceStatus?: PersistenceStatus

  // Accounting
  expenseAccount?: string
  accumulatedAccount?: string

  // Fixed-asset specific
  assetCategory?: string
  capitalizedCosts?: number
  componentTracking?: boolean
  placedInServiceDate?: string
  acquisitionDate?: string
  isQip?: boolean
  physicalCondition?: PhysicalCondition | string

  // Lease specific (ASC 842)
  leaseClassification?: LeaseClassification | ''
  paymentAmount?: number
  paymentFrequency?: PaymentFrequency
  paymentTiming?: PaymentTiming
  ibr?: number
  purchaseOptionAmount?: number
  purchaseOptionReasonablyCertain?: boolean
  renewalOptionTerm?: number
  renewalReasonablyCertain?: boolean
  leaseIncentives?: number
  initialDirectCosts?: number
  prepaidLeasePayments?: number
  escalationType?: string
  escalationRate?: number
  escalationFrequency?: string
  variableLeasePayments?: boolean

  // Loan specific
  principalAmount?: number
  interestRate?: number
  rateType?: string
  variableRateIndex?: string
  spreadOverIndex?: number
  loanPaymentAmount?: number
  loanPaymentFrequency?: PaymentFrequency
  compoundingFrequency?: PaymentFrequency
  loanTerm?: number
  amortizationTerm?: number
  balloonPayment?: number
  originationDate?: string
  firstPaymentDate?: string

  // Tax (MACRS / Section 179 / Bonus)
  macrsPropertyClass?: MacrsPropertyClass | string
  macrsSystem?: string
  convention?: string
  section179Election?: boolean
  section179Amount?: number
  bonusDepreciationElection?: boolean
  bonusDepreciationPercentage?: string
  stateTaxTreatment?: string
  stateSpecificMethod?: string
  listedProperty?: boolean
  businessUsePercentage?: number

  // Disposal
  disposalDate?: string
  saleProceeds?: number
  gainLossAccount?: string
  clearingAccount?: string
  assetAccount?: string
  gaapGainLoss?: number
  taxGainLoss?: number

  // Intangible
  intangibleType?: IntangibleType | string
  definiteLife?: 'Definite' | 'Indefinite' | string
  legalLife?: number
  expectedBenefitPeriod?: number
  impairmentTestDate?: string
  acquisitionType?: string

  // Software
  softwareStage?: SoftwareStage | string
  internalExternal?: 'Internal' | 'External' | string
  totalCapitalizedCost?: number
  trainingCosts?: number
  maintenanceCosts?: number
  hostingArrangement?: boolean
}

/**
 * Keys on `AmortizationForm` that map to first-class columns on the
 * `amortizations` table. Everything else is persisted to `type_specific`.
 * Keep in sync with `backend/models/db_models.py::Amortization` columns.
 */
export const FIRST_CLASS_FORM_KEYS = [
  'assetName',
  'assetType',
  'costBasis',
  'salvageValue',
  'usefulLifeMonths',
  'gaapMethod',
  'taxMethod',
  'startDate',
  'vendor',
] as const

// ---------------------------------------------------------------------------
// Schedule + journal row shapes
// ---------------------------------------------------------------------------

/**
 * Generic schedule row — superset of every column the backend math may emit.
 * SL/DDB: openingBalance, expense, closingBalance.
 * Loan:   payment, interest, principal, openingBalance, closingBalance.
 * Lease:  rouOpening, slExpense, totalExpense, interestExpense, liabBalance,
 *         liabOpening, liabClosing, accretion.
 * MACRS:  rate, expense, accumulated, basis.
 */
export interface ScheduleRow {
  period: number
  date: string // YYYY-MM-DD
  openingBalance?: number
  expense?: number
  closingBalance?: number

  // Loan
  payment?: number
  interest?: number
  principal?: number

  // Lease
  rouOpening?: number
  rouClosing?: number
  slExpense?: number
  interestExpense?: number
  totalExpense?: number
  liabOpening?: number
  liabClosing?: number
  liabBalance?: number
  accretion?: number

  // MACRS
  rate?: number
  basis?: number
  accumulated?: number

  // Catch-all for any backend field not enumerated above
  [extra: string]: number | string | undefined
}

/** One side of a generated journal entry — UI render shape. */
export interface JournalLine {
  id: string
  date: string // YYYY-MM-DD
  account: string
  debit: number | null
  credit: number | null
  memo: string
}

// ---------------------------------------------------------------------------
// Default chart of accounts (used when the form leaves an account blank).
// ---------------------------------------------------------------------------

export const DEFAULT_ACCOUNTS = {
  expenseAccount: '6000 — Amortization / Depreciation Expense',
  accumulatedAccount: '1600 — Accumulated Amortization / Depreciation',
  gainLossAccount: '7500 — Gain / Loss on Disposal',
  clearingAccount: '1099 — Asset Disposal Clearing',
  assetAccount: '1500 — Fixed Assets',
} as const

// ---------------------------------------------------------------------------
// CSV column map — used by the bulk-upload flow to translate CPAAnalytics'
// canonical column headers into `AmortizationForm` field names. Source:
// CPAAnalytics/src/components/modules/Amortization.tsx (~lines 831–943).
// Values are the AmortizationForm keys; "type_specific:<key>" indicates the
// field is stored under the type_specific JSONB blob (used as a hint when
// callers want to bypass splitFormForApi).
// ---------------------------------------------------------------------------

export const CSV_COLUMN_MAP: Record<string, keyof AmortizationForm> = {
  // Common
  'Asset Name': 'assetName',
  'Asset Type': 'assetType',
  'Asset Tag / ID': 'assetTag',
  Department: 'department',
  Location: 'location',
  'Vendor / Supplier': 'vendor',
  // Financial
  'Acquisition Cost': 'costBasis',
  'Salvage Value': 'salvageValue',
  'Useful Life (Months)': 'usefulLifeMonths',
  'GAAP Method': 'gaapMethod',
  'Tax Method': 'taxMethod',
  'Start Date': 'startDate',
  Status: 'status',
  'Expense Account': 'expenseAccount',
  'Accumulated Account': 'accumulatedAccount',
  // Fixed-asset
  'Asset Category': 'assetCategory',
  'Physical Condition': 'physicalCondition',
  'Is QIP': 'isQip',
  // Software
  'Software Stage': 'softwareStage',
  'Use Type': 'internalExternal',
  'Total Capitalized Cost': 'totalCapitalizedCost',
  // Intangible
  'Intangible Type': 'intangibleType',
  'Life Type': 'definiteLife',
  'Legal Life (Months)': 'legalLife',
  // Lease
  'Lease Classification': 'leaseClassification',
  'Payment Amount': 'paymentAmount',
  'Payment Frequency': 'paymentFrequency',
  'Incremental Borrowing Rate': 'ibr',
  'Payment Timing': 'paymentTiming',
  // Loan
  'Principal Amount': 'principalAmount',
  'Interest Rate': 'interestRate',
  'Rate Type': 'rateType',
  'Compounding Frequency': 'compoundingFrequency',
  'Loan Term': 'loanTerm',
  'Amortization Term': 'amortizationTerm',
  'Balloon Payment': 'balloonPayment',
  'Origination Date': 'originationDate',
  'First Payment Date': 'firstPaymentDate',
  // Tax
  'MACRS Property Class': 'macrsPropertyClass',
  'MACRS System': 'macrsSystem',
  Convention: 'convention',
  'Section 179 Election': 'section179Election',
  'Section 179 Amount': 'section179Amount',
  'Bonus Depreciation Election': 'bonusDepreciationElection',
  'Bonus Depreciation Percentage': 'bonusDepreciationPercentage',
  'State Tax Treatment': 'stateTaxTreatment',
  'State Specific Method': 'stateSpecificMethod',
  'Listed Property': 'listedProperty',
  'Business Use %': 'businessUsePercentage',
}

// ---------------------------------------------------------------------------
// Report definitions — drive the Amortization /reports view in 5.5.
// ---------------------------------------------------------------------------

export type ReportKey =
  | 'all_assets_schedule'
  | 'monthly_expense_summary'
  | 'gaap_vs_tax'
  | 'asset_register'
  | 'gain_loss_disposal'

export interface ReportDef {
  key: ReportKey
  name: string
  description: string
}

export const REPORT_DEFS: readonly ReportDef[] = [
  {
    key: 'all_assets_schedule',
    name: 'All Assets Schedule',
    description: 'GAAP schedule (tab 1) and tax schedule (tab 2) for every asset.',
  },
  {
    key: 'monthly_expense_summary',
    name: 'Monthly Expense Summary',
    description: 'Total amortization / depreciation expense aggregated by period.',
  },
  {
    key: 'gaap_vs_tax',
    name: 'GAAP vs Tax Comparison',
    description: 'Side-by-side GAAP schedule and tax (MACRS) schedule per asset.',
  },
  {
    key: 'asset_register',
    name: 'Asset Register',
    description: 'Master list of assets with tags, locations, vendors, and NBV.',
  },
  {
    key: 'gain_loss_disposal',
    name: 'Gain / Loss for Disposal',
    description: 'Gain or loss on disposed assets by period.',
  },
] as const

// ---------------------------------------------------------------------------
// Convenience factory — fresh form with the Software Costs default prefill
// (matches CPAAnalytics' INITIAL_FORM_STATE so the create form opens with
// recognizable sample data).
// ---------------------------------------------------------------------------

export function createDefaultAmortizationForm(): AmortizationForm {
  const sample = ASSET_TYPE_DEFAULTS['Software Costs']
  return {
    assetName: sample.assetName,
    assetType: 'Software Costs',
    department: sample.department,
    vendor: sample.vendor,
    costBasis: 50000,
    salvageValue: 0,
    startDate: new Date().toISOString().split('T')[0],
    usefulLifeMonths: 36,
    gaapMethod: 'Straight-Line',
    taxMethod: 'Straight-Line',
    status: 'Active',
    expenseAccount: DEFAULT_ACCOUNTS.expenseAccount,
    accumulatedAccount: DEFAULT_ACCOUNTS.accumulatedAccount,
  }
}
