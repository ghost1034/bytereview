// Pure-function helpers used by the Amortization UI for derivations that
// do not warrant a round-trip to the backend (form ↔ wire conversion, NBV
// for the portfolio table, journal-entry generation, disposal proration,
// portfolio totals). The heavy math (SL, DDB, MACRS, loan, ASC 842 leases)
// runs server-side in `amortization_math.py`.

import type { AnalyticsAmortization, AnalyticsAmortizationCreateRequest, AnalyticsAmortizationScheduleRequest } from '@/lib/analytics/types'

import {
  AmortizationForm,
  DEFAULT_ACCOUNTS,
  FIRST_CLASS_FORM_KEYS,
  JournalLine,
  ScheduleRow,
  type ScheduleMethodKey,
} from '@/lib/analytics/amortizationTypes'

// ---------------------------------------------------------------------------
// Form ↔ wire conversion
// ---------------------------------------------------------------------------

const FIRST_CLASS_SET = new Set<string>(FIRST_CLASS_FORM_KEYS)

/**
 * Partition an `AmortizationForm` into the columns the backend expects vs the
 * `type_specific` JSONB blob. The backend stores first-class fields in their
 * own columns; everything else (lease params, MACRS election, disposal, etc.)
 * lives under `type_specific` keyed by the original camelCase form key.
 */
export function splitFormForApi(
  form: AmortizationForm,
  opts: { clientId?: string | null; status?: string; approvalStatus?: string } = {}
): Omit<AnalyticsAmortizationCreateRequest, 'schedule' | 'tax_schedule'> {
  const typeSpecific: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(form)) {
    if (key === 'id') continue
    if (FIRST_CLASS_SET.has(key)) continue
    if (value === undefined) continue
    typeSpecific[key] = value
  }

  return {
    asset_name: form.assetName,
    asset_type: form.assetType,
    client_id: opts.clientId ?? null,
    cost_basis: form.costBasis ?? null,
    salvage_value: form.salvageValue ?? null,
    useful_life_months: form.usefulLifeMonths ?? null,
    gaap_method: form.gaapMethod ?? null,
    tax_method: form.taxMethod ?? null,
    start_date: form.startDate ?? null,
    vendor: form.vendor ?? null,
    // Portfolio workflow status (draft → published). Lifecycle lives in type_specific.status.
    status: opts.status ?? form.persistenceStatus ?? 'published',
    approval_status: opts.approvalStatus ?? form.approvalStatus ?? 'approved',
    type_specific: typeSpecific,
  }
}

/** Inverse: turn an API response into an `AmortizationForm` for the edit UI. */
export function mergeFormFromApi(row: AnalyticsAmortization): AmortizationForm {
  const extra = (row.type_specific ?? {}) as Partial<AmortizationForm>
  const { status: lifecycleStatus, persistenceStatus: _ignored, ...restExtra } = extra
  return {
    id: row.id,
    assetName: row.asset_name,
    assetType: row.asset_type,
    costBasis: row.cost_basis ?? 0,
    salvageValue: row.salvage_value ?? 0,
    usefulLifeMonths: row.useful_life_months ?? 0,
    gaapMethod: row.gaap_method ?? 'Straight-Line',
    taxMethod: row.tax_method ?? 'Straight-Line',
    startDate: row.start_date ?? '',
    vendor: row.vendor ?? '',
    status: lifecycleStatus ?? 'Active',
    persistenceStatus: row.status as AmortizationForm['persistenceStatus'],
    approvalStatus: row.approval_status as AmortizationForm['approvalStatus'],
    ...restExtra,
  } as AmortizationForm
}

/** Lifecycle status stored in type_specific (Active, Disposed, etc.). */
export function getLifecycleStatus(
  row: Pick<AnalyticsAmortization, 'status' | 'type_specific'>,
): string {
  const extra = (row.type_specific ?? {}) as Partial<AmortizationForm>
  if (typeof extra.status === 'string' && extra.status.trim()) {
    return extra.status
  }
  if (row.status === 'published') return 'Active'
  return row.status ?? 'Active'
}

/** Whether the asset record is still a draft in the portfolio workflow. */
export function isDraftRecord(row: Pick<AnalyticsAmortization, 'status'>): boolean {
  return (row.status ?? '').toLowerCase() === 'draft'
}

/**
 * Map backend MACRS schedule rows (year, macrsRate, totalDep, taxBasis, …)
 * into the ScheduleRow shape the UI tables expect.
 */
export function normalizeMacrsScheduleRows(
  rows: ScheduleRow[],
  costBasis = 0,
): ScheduleRow[] {
  if (rows.length === 0) return rows

  const first = rows[0]
  if (
    typeof first.expense === 'number' &&
    (typeof first.period === 'number' || typeof first.year === 'number') &&
    typeof first.date === 'string' &&
    first.date.length > 0
  ) {
    return rows
  }

  let accumulated = 0
  return rows.map((row, idx) => {
    const period =
      (typeof row.period === 'number' ? row.period : undefined) ??
      (typeof row.year === 'number' ? row.year : idx + 1)
    const ratePct =
      (typeof row.macrsRate === 'number' ? row.macrsRate : undefined) ??
      (typeof row.rate === 'number' ? row.rate * 100 : 0)
    const expense =
      (typeof row.totalDep === 'number' ? row.totalDep : undefined) ??
      (typeof row.expense === 'number' ? row.expense : 0)
    accumulated += expense
    const basis =
      (typeof row.taxBasis === 'number' ? row.taxBasis : undefined) ??
      (typeof row.basis === 'number' ? row.basis : Math.max(0, costBasis - accumulated))

    return {
      ...row,
      period,
      date:
        typeof row.date === 'string' && row.date
          ? row.date
          : `${period}-12-31`,
      rate: ratePct / 100,
      expense,
      accumulated,
      basis,
    }
  })
}

/** Build the MACRS schedule API payload from form tax-detail fields. */
export function buildMacrsScheduleRequest(
  form: Pick<
    AmortizationForm,
    | 'assetType'
    | 'costBasis'
    | 'salvageValue'
    | 'usefulLifeMonths'
    | 'startDate'
    | 'macrsPropertyClass'
    | 'macrsSystem'
    | 'convention'
    | 'section179Election'
    | 'section179Amount'
    | 'bonusDepreciationElection'
    | 'bonusDepreciationPercentage'
    | 'listedProperty'
    | 'businessUsePercentage'
  >
): AnalyticsAmortizationScheduleRequest {
  const bonusRaw = form.bonusDepreciationPercentage ?? ''
  const bonusPercent = bonusRaw
    ? Number.parseFloat(String(bonusRaw).replace('%', ''))
    : undefined
  const parsedYear = form.startDate
    ? Number.parseInt(form.startDate.slice(0, 4), 10)
    : Number.NaN

  return {
    assetType: form.assetType,
    method: 'macrs',
    costBasis: form.costBasis ?? 0,
    salvageValue: form.salvageValue ?? 0,
    usefulLifeMonths: form.usefulLifeMonths ?? 0,
    startDate: form.startDate || undefined,
    propertyClass: form.macrsPropertyClass ?? '5-year',
    macrsSystem: form.macrsSystem ?? 'GDS',
    convention: form.convention ?? 'Half-Year',
    section179Election: !!form.section179Election,
    bonusDepreciationElection: !!form.bonusDepreciationElection,
    listedProperty: !!form.listedProperty,
    businessUsePercentage: form.listedProperty ? form.businessUsePercentage : undefined,
    bonusPercent: form.bonusDepreciationElection ? bonusPercent : 0,
    section179: form.section179Election ? form.section179Amount ?? 0 : 0,
    startYear: Number.isFinite(parsedYear) ? parsedYear : undefined,
  }
}

/** Extract the expense / depreciation amount from any schedule row shape. */
export function scheduleRowExpense(row: ScheduleRow | undefined): number {
  if (!row) return 0
  if (typeof row.totalDep === 'number') return row.totalDep
  if (typeof row.expense === 'number') return row.expense
  if (typeof row.totalExpense === 'number') return row.totalExpense
  if (typeof row.slExpense === 'number') return row.slExpense
  if (typeof row.interest === 'number') return row.interest
  return 0
}

export function gaapMethodKey(form: Pick<AmortizationForm, 'assetType'>): ScheduleMethodKey {
  if (form.assetType === 'Loan Amortization') return 'loan'
  if (form.assetType === 'Lease - Operating') return 'operating_lease'
  if (form.assetType === 'Lease - Finance') return 'finance_lease'
  return 'straight_line'
}

export function canGenerateSchedules(form: AmortizationForm): boolean {
  if (!form.startDate) return false
  if (form.assetType === 'Loan Amortization' || form.assetType.includes('Lease')) {
    return (form.costBasis ?? 0) > 0 || (form.paymentAmount ?? 0) > 0
  }
  return (form.costBasis ?? 0) > 0 && (form.usefulLifeMonths ?? 0) > 0
}

export function buildGaapScheduleRequest(
  form: AmortizationForm,
  method: ScheduleMethodKey,
): AnalyticsAmortizationScheduleRequest {
  const periods = form.usefulLifeMonths ?? 0
  return {
    assetType: form.assetType,
    method,
    costBasis: form.costBasis ?? 0,
    salvageValue: form.salvageValue ?? 0,
    usefulLifeMonths: periods,
    startDate: form.startDate || undefined,
    annualRate:
      form.interestRate != null
        ? form.interestRate / (form.interestRate > 1 ? 100 : 1)
        : undefined,
    paymentAmount: form.paymentAmount ?? undefined,
    ibr: form.ibr != null ? form.ibr / (form.ibr > 1 ? 100 : 1) : undefined,
    directCosts: form.initialDirectCosts ?? undefined,
    prepaid: form.prepaidLeasePayments ?? undefined,
    incentives: form.leaseIncentives ?? undefined,
    startYear: form.startDate ? new Date(form.startDate).getFullYear() : undefined,
  }
}

type ScheduleGenerator = (
  req: AnalyticsAmortizationScheduleRequest,
) => Promise<{ schedule?: ScheduleRow[] }>

/** Generate GAAP and tax schedules from form fields (same logic as the asset form). */
export async function generateAssetSchedules(
  form: AmortizationForm,
  generate: ScheduleGenerator,
): Promise<{ schedule: ScheduleRow[]; taxSchedule: ScheduleRow[] }> {
  const gaapKey = gaapMethodKey(form)
  const gaapRes = await generate(buildGaapScheduleRequest(form, gaapKey))
  const schedule = (gaapRes.schedule ?? []) as ScheduleRow[]

  let taxSchedule: ScheduleRow[] = []
  if (form.taxMethod === 'MACRS') {
    const taxRes = await generate(buildMacrsScheduleRequest(form))
    taxSchedule = normalizeMacrsScheduleRows(
      (taxRes.schedule ?? []) as ScheduleRow[],
      form.costBasis ?? 0,
    )
  }

  return { schedule, taxSchedule }
}

/**
 * Ensure each asset has schedule data for reporting — uses stored schedules when
 * present, otherwise generates them on the fly from saved asset fields.
 */
export async function resolveAssetsForReports(
  rows: AnalyticsAmortization[],
  generate: ScheduleGenerator,
): Promise<AnalyticsAmortization[]> {
  return Promise.all(
    rows.map(async (row) => {
      const gaap = (row.schedule ?? []) as ScheduleRow[]
      const tax = (row.tax_schedule ?? []) as ScheduleRow[]
      if (gaap.length > 0) {
        const normalizedTax =
          tax.length > 0 && row.tax_method === 'MACRS'
            ? normalizeMacrsScheduleRows(tax, row.cost_basis ?? 0)
            : tax
        return { ...row, tax_schedule: normalizedTax }
      }

      const form = mergeFormFromApi(row)
      if (!canGenerateSchedules(form)) return row

      try {
        const generated = await generateAssetSchedules(form, generate)
        return {
          ...row,
          schedule: generated.schedule,
          tax_schedule: generated.taxSchedule.length > 0 ? generated.taxSchedule : row.tax_schedule,
        }
      } catch {
        return row
      }
    }),
  )
}

// ---------------------------------------------------------------------------
// Portfolio / NBV
// ---------------------------------------------------------------------------

/** Return the closing balance of the latest schedule row whose date ≤ asOf. */
export function computeNbv(
  asset: Pick<AnalyticsAmortization, 'cost_basis' | 'schedule'>,
  asOfDate?: string
): number {
  const schedule = (asset.schedule ?? []) as unknown as ScheduleRow[]
  if (schedule.length === 0) return asset.cost_basis ?? 0

  const cutoff = asOfDate ?? new Date().toISOString().split('T')[0]
  let latest: ScheduleRow | undefined
  for (const row of schedule) {
    if (typeof row.date !== 'string') continue
    if (row.date <= cutoff) latest = row
    else break
  }
  if (!latest) return asset.cost_basis ?? 0

  const closing =
    typeof latest.closingBalance === 'number'
      ? latest.closingBalance
      : typeof latest.liabBalance === 'number'
        ? latest.liabBalance
        : (asset.cost_basis ?? 0)
  return closing
}

export interface PortfolioSummary {
  totalCostBasis: number
  totalNbv: number
  monthlyExpense: number
  byAssetType: Record<string, { count: number; costBasis: number; nbv: number }>
}

/** Totals for the portfolio dashboard header. */
export function summarizePortfolio(
  assets: AnalyticsAmortization[],
  asOfDate?: string
): PortfolioSummary {
  const summary: PortfolioSummary = {
    totalCostBasis: 0,
    totalNbv: 0,
    monthlyExpense: 0,
    byAssetType: {},
  }
  const cutoff = asOfDate ?? new Date().toISOString().split('T')[0]

  for (const asset of assets) {
    const cost = asset.cost_basis ?? 0
    const nbv = computeNbv(asset, cutoff)
    summary.totalCostBasis += cost
    summary.totalNbv += nbv

    const schedule = (asset.schedule ?? []) as unknown as ScheduleRow[]
    const currentRow = schedule.find(r => typeof r.date === 'string' && r.date >= cutoff)
    if (currentRow?.expense) summary.monthlyExpense += currentRow.expense

    const bucket =
      summary.byAssetType[asset.asset_type] ?? { count: 0, costBasis: 0, nbv: 0 }
    bucket.count += 1
    bucket.costBasis += cost
    bucket.nbv += nbv
    summary.byAssetType[asset.asset_type] = bucket
  }

  return summary
}

// ---------------------------------------------------------------------------
// Journal entries
// ---------------------------------------------------------------------------

interface JournalDerivationContext {
  expenseAccount?: string
  accumulatedAccount?: string
  liabilityAccount?: string
  cashAccount?: string
}

/**
 * Derive double-entry lines for one schedule period.
 *
 * - Standard SL/DDB:  Dr Expense / Cr Accumulated.
 * - Loan (has principal+interest): Dr Interest Expense + Dr Liability / Cr Cash.
 * - Lease (has totalExpense / interestExpense): Dr Lease Expense / Cr Liability + Cr Accumulated ROU.
 */
export function deriveJournalLines(
  row: ScheduleRow,
  form: Pick<AmortizationForm, 'assetName' | 'expenseAccount' | 'accumulatedAccount'>,
  ctx: JournalDerivationContext = {}
): JournalLine[] {
  const expenseAcct = form.expenseAccount || ctx.expenseAccount || DEFAULT_ACCOUNTS.expenseAccount
  const accumAcct =
    form.accumulatedAccount || ctx.accumulatedAccount || DEFAULT_ACCOUNTS.accumulatedAccount
  const liabAcct = ctx.liabilityAccount || '2000 — Lease / Loan Liability'
  const cashAcct = ctx.cashAccount || '1000 — Cash'
  const date = row.date
  const memo = `${form.assetName} — period ${row.period}`
  const idBase = `${date}-${row.period}`

  const lines: JournalLine[] = []

  // Loan: principal + interest split paid to cash
  if (typeof row.principal === 'number' && typeof row.interest === 'number') {
    lines.push(
      {
        id: `${idBase}-int`,
        date,
        account: expenseAcct,
        debit: round2(row.interest),
        credit: null,
        memo,
      },
      {
        id: `${idBase}-prin`,
        date,
        account: liabAcct,
        debit: round2(row.principal),
        credit: null,
        memo,
      },
      {
        id: `${idBase}-cash`,
        date,
        account: cashAcct,
        debit: null,
        credit: round2((row.payment ?? 0) || row.principal + row.interest),
        memo,
      }
    )
    return lines
  }

  // Lease: total expense split into interest + amortization-of-ROU
  if (typeof row.totalExpense === 'number' && typeof row.interestExpense === 'number') {
    const rouAmort = round2(row.totalExpense - row.interestExpense)
    lines.push(
      {
        id: `${idBase}-exp`,
        date,
        account: expenseAcct,
        debit: round2(row.totalExpense),
        credit: null,
        memo,
      },
      {
        id: `${idBase}-rou`,
        date,
        account: accumAcct,
        debit: null,
        credit: rouAmort,
        memo,
      },
      {
        id: `${idBase}-liab`,
        date,
        account: liabAcct,
        debit: null,
        credit: round2(row.interestExpense),
        memo,
      }
    )
    return lines
  }

  // Default: simple Dr Expense / Cr Accumulated
  const expense = row.expense ?? 0
  lines.push(
    {
      id: `${idBase}-dr`,
      date,
      account: expenseAcct,
      debit: round2(expense),
      credit: null,
      memo,
    },
    {
      id: `${idBase}-cr`,
      date,
      account: accumAcct,
      debit: null,
      credit: round2(expense),
      memo,
    }
  )
  return lines
}

/**
 * Build the 4-line disposal journal entry used by both the DisposalDialog
 * (when an asset is being disposed) and the Journal Entries view (when
 * rendering historical disposals for a given month).
 *
 * Lines:
 *   Dr Clearing/Cash         saleProceeds
 *   Dr Accumulated           accumDepr            (reverse accumulated)
 *   Cr Asset                 cost                 (derecognize at cost)
 *   Dr/Cr Gain or Loss       |gainLoss|           (plug for the difference)
 */
export function buildDisposalJournalLines(args: {
  assetName: string
  date: string // YYYY-MM-DD
  cost: number
  accumDepr: number
  saleProceeds: number
  gainLoss: number
  clearingAccount?: string
  accumulatedAccount?: string
  assetAccount?: string
  gainLossAccount?: string
}): JournalLine[] {
  const {
    assetName,
    date,
    cost,
    accumDepr,
    saleProceeds,
    gainLoss,
    clearingAccount = DEFAULT_ACCOUNTS.clearingAccount,
    accumulatedAccount = DEFAULT_ACCOUNTS.accumulatedAccount,
    assetAccount = DEFAULT_ACCOUNTS.assetAccount,
    gainLossAccount = DEFAULT_ACCOUNTS.gainLossAccount,
  } = args
  const isGain = gainLoss >= 0
  const idBase = `${date}-disposal-${assetName}`
  return [
    {
      id: `${idBase}-proceeds`,
      date,
      account: clearingAccount,
      debit: round2(saleProceeds),
      credit: null,
      memo: `Proceeds — ${assetName}`,
    },
    {
      id: `${idBase}-accum`,
      date,
      account: accumulatedAccount,
      debit: round2(Math.max(0, accumDepr)),
      credit: null,
      memo: `Reverse accumulated depreciation — ${assetName}`,
    },
    {
      id: `${idBase}-asset`,
      date,
      account: assetAccount,
      debit: null,
      credit: round2(cost),
      memo: `Derecognize asset — ${assetName}`,
    },
    {
      id: `${idBase}-gainloss`,
      date,
      account: gainLossAccount,
      debit: isGain ? null : round2(Math.abs(gainLoss)),
      credit: isGain ? round2(gainLoss) : null,
      memo: `${isGain ? 'Gain' : 'Loss'} on disposal — ${assetName}`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

export interface DisposalResult {
  truncatedSchedule: ScheduleRow[]
  nbvAtDisposal: number
  gainLoss: number
  /** Accumulated expense (depreciation/amortization) through the disposal date. */
  accumAtDisposal: number
}

/**
 * Clip a schedule at the disposal date and prorate the expense for the
 * disposal month by `daysActive / daysInMonth`. Mirrors CPAAnalytics'
 * `processScheduleWithDisposal` so a mid-month disposal records the partial
 * month's expense (not the full month, and not zero). Returns the clipped
 * schedule with a rebuilt final row, NBV/accumulated at disposal, and
 * gainLoss = proceeds - NBV.
 */
export function prorateDisposal(
  schedule: ScheduleRow[],
  disposalDate: string,
  saleProceeds: number,
  costBasis?: number
): DisposalResult {
  if (schedule.length === 0) {
    return { truncatedSchedule: [], nbvAtDisposal: 0, gainLoss: saleProceeds, accumAtDisposal: 0 }
  }

  const disposalMonth = disposalDate.slice(0, 7) // YYYY-MM
  const initialOpening =
    typeof schedule[0].openingBalance === 'number'
      ? (schedule[0].openingBalance as number)
      : (costBasis ?? 0)

  const truncated: ScheduleRow[] = []
  let accum = 0
  let nbvAtDisposal = initialOpening

  for (const row of schedule) {
    if (typeof row.date !== 'string') continue
    const rowMonth = row.date.slice(0, 7)
    if (rowMonth > disposalMonth) break

    const expense =
      (typeof row.expense === 'number' && row.expense) ||
      (typeof row.totalExpense === 'number' && row.totalExpense) ||
      (typeof row.slExpense === 'number' && row.slExpense) ||
      (typeof row.interest === 'number' && row.interest) ||
      0

    if (rowMonth < disposalMonth) {
      accum += expense
      truncated.push(row)
      if (typeof row.closingBalance === 'number') nbvAtDisposal = row.closingBalance
      else if (typeof row.liabBalance === 'number') nbvAtDisposal = row.liabBalance
      continue
    }

    // disposalMonth: prorate by days
    const d = new Date(disposalDate + 'T00:00:00Z')
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    const daysActive = d.getUTCDate()
    const ratio = daysInMonth > 0 ? daysActive / daysInMonth : 1
    const proratedExpense = expense * ratio
    accum += proratedExpense

    const basis =
      costBasis ??
      (typeof schedule[0].openingBalance === 'number' ? (schedule[0].openingBalance as number) : 0)
    const closing = Math.max(0, basis - accum)
    nbvAtDisposal = closing

    const proratedRow: ScheduleRow = { ...row }
    if (typeof row.expense === 'number') proratedRow.expense = proratedExpense
    if (typeof row.totalExpense === 'number') proratedRow.totalExpense = proratedExpense
    if (typeof row.slExpense === 'number') proratedRow.slExpense = proratedExpense
    if (typeof row.interest === 'number') proratedRow.interest = proratedExpense
    if (typeof row.closingBalance === 'number') proratedRow.closingBalance = closing
    if (typeof row.liabBalance === 'number') proratedRow.liabBalance = closing
    proratedRow.accumulated = accum
    proratedRow.nbv = closing
    truncated.push(proratedRow)
    break
  }

  return {
    truncatedSchedule: truncated,
    nbvAtDisposal: round2(nbvAtDisposal),
    gainLoss: round2(saleProceeds - nbvAtDisposal),
    accumAtDisposal: round2(accum),
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
