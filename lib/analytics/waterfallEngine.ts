// Deterministic waterfall math: monthly recognition schedule + double-entry
// journal entries, write-offs, and as-of-date aggregation. Pure functions only
// — no network, no Firestore. Ported from CPAAnalytics' Waterfall component
// (`calculateWaterfall`, `performWriteOff`) with the schedule/JE behaviour kept
// intact.
//
// Deliberate correction vs. the CPAAnalytics original: recognition-date
// strings are formatted from local date components (`toYMD`) rather than
// `Date.toISOString()`. The original could shift the last-day-of-month date by
// one day in positive-UTC-offset timezones; financial amounts/periods are
// unaffected.

import type {
  JournalEntry,
  RecognitionMethod,
  ScheduleRow,
  WaterfallForm,
  WaterfallSubtype,
} from './waterfallTypes'
import { DEFAULT_ACCOUNTS } from './waterfallTypes'

export interface WaterfallResult {
  schedule: ScheduleRow[]
  journalEntries: JournalEntry[]
}

/** Format a Date as YYYY-MM-DD from local components (timezone-stable). */
function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** "Jan 2026" → 202600 (year*100 + zero-indexed month), or null if unparseable. */
export function periodToYYYYMM(period: string): number | null {
  const t = new Date(`${period} 1`).getTime()
  if (isNaN(t)) return null
  const d = new Date(t)
  return d.getFullYear() * 100 + d.getMonth()
}

/** "2026-03" → 202602 (year*100 + zero-indexed month). */
export function monthKeyToYYYYMM(monthKey: string): number | null {
  const m = monthKey.match(/^(\d{4})-(\d{1,2})/)
  if (!m) return null
  return parseInt(m[1], 10) * 100 + (parseInt(m[2], 10) - 1)
}

/**
 * Build the recognition schedule and journal entries for a waterfall form.
 * Returns empty arrays for invalid input (NaN amount or start >= end).
 */
export function calculateWaterfall(form: WaterfallForm): WaterfallResult {
  const [sYear, sMonth, sDay] = form.startDate.split('-')
  const start = new Date(Number(sYear), Number(sMonth) - 1, Number(sDay))
  const [eYear, eMonth, eDay] = form.endDate.split('-')
  const end = new Date(Number(eYear), Number(eMonth) - 1, Number(eDay))
  const totalValue = Number(form.totalAmount)

  if (isNaN(totalValue) || start >= end) {
    return { schedule: [], journalEntries: [] }
  }

  const newSchedule: ScheduleRow[] = []
  const newJournalEntries: JournalEntry[] = []

  const isDeferred = form.type === 'Deferred Revenue'
  const isPrepaid = form.type === 'Prepaid Expenses'
  const isAccrued = form.type === 'Accrued Expenses'
  const isCommission = form.type === 'Deferred Commission'

  // Initial journal entries
  if (isDeferred) {
    newJournalEntries.push({ id: 'je-init-ar', date: form.startDate, account: '1200 — Accounts Receivable', debit: totalValue, credit: null, memo: `Invoice for ${form.name}` })
    newJournalEntries.push({ id: 'je-init-dr', date: form.startDate, account: form.deferredAccount, debit: null, credit: totalValue, memo: `Invoice for ${form.name}` })
  } else if (isPrepaid) {
    const pDate = form.paymentDate || form.startDate
    newJournalEntries.push({ id: 'je-init-prepaid', date: pDate, account: form.prepaidAccount, debit: totalValue, credit: null, memo: `Payment for ${form.name}` })
    newJournalEntries.push({ id: 'je-init-cash', date: pDate, account: '1000 — Cash', debit: null, credit: totalValue, memo: `Payment for ${form.name}` })
  } else if (isCommission) {
    const pDate = form.paymentDate || form.startDate
    newJournalEntries.push({ id: 'je-init-defcomm', date: pDate, account: form.defCommAccount, debit: totalValue, credit: null, memo: `Commission to ${form.partyName} — ${form.name}` })
    newJournalEntries.push({ id: 'je-init-cash', date: pDate, account: '1000 — Cash', debit: null, credit: totalValue, memo: `Commission to ${form.partyName} — ${form.name}` })
  }

  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const dailyRate = totalValue / totalDays

  const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  const monthlyRate = totalValue / totalMonths

  const currentDate = new Date(start.getFullYear(), start.getMonth(), 1)
  const endDateLimit = new Date(end.getFullYear(), end.getMonth(), 1)

  let openingBalance = isAccrued ? 0 : totalValue
  let cumulative = 0

  while (currentDate <= endDateLimit) {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    const activeStart = start > monthStart ? start : monthStart
    const activeEnd = end < monthEnd ? end : monthEnd

    let recognized = 0
    if (form.recognitionMethod === 'Pro-Rata Daily') {
      const daysInMonth = Math.round((activeEnd.getTime() - activeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      recognized = daysInMonth * dailyRate
    } else {
      // Straight-Line
      recognized = monthlyRate
    }

    // Handle rounding errors on the last month
    if (currentDate.getTime() === endDateLimit.getTime()) {
      recognized = totalValue - cumulative
    }

    const closingBalance = isAccrued ? openingBalance + recognized : openingBalance - recognized

    cumulative += recognized

    const periodStr = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

    newSchedule.push({
      id: `s-${periodStr}`,
      period: periodStr,
      billed: 0,
      cashReceived: 0,
      opening: openingBalance,
      recognized,
      closing: Math.max(0, closingBalance),
      cumulative,
      remaining: Math.max(0, totalValue - cumulative),
    })

    // Monthly recognition journal entry (last day of month)
    const recognitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
    const formattedRecDate = toYMD(recognitionDate)

    if (isDeferred) {
      newJournalEntries.push({ id: `je-${formattedRecDate}-dr`, date: formattedRecDate, account: form.deferredAccount || DEFAULT_ACCOUNTS.deferredAccount, debit: recognized, credit: null, memo: `${periodStr} revenue recognition — ${form.partyName}` })
      newJournalEntries.push({ id: `je-${formattedRecDate}-rev`, date: formattedRecDate, account: form.revenueAccount || DEFAULT_ACCOUNTS.revenueAccount, debit: null, credit: recognized, memo: `${periodStr} revenue recognition — ${form.partyName}` })
    } else if (isPrepaid) {
      newJournalEntries.push({ id: `je-${formattedRecDate}-exp`, date: formattedRecDate, account: form.expenseAccount || DEFAULT_ACCOUNTS.expenseAccount, debit: recognized, credit: null, memo: `${periodStr} amortization — ${form.partyName}` })
      newJournalEntries.push({ id: `je-${formattedRecDate}-prepaid`, date: formattedRecDate, account: form.prepaidAccount || DEFAULT_ACCOUNTS.prepaidAccount, debit: null, credit: recognized, memo: `${periodStr} amortization — ${form.partyName}` })
    } else if (isAccrued) {
      newJournalEntries.push({ id: `je-${formattedRecDate}-exp`, date: formattedRecDate, account: form.expenseAccount || DEFAULT_ACCOUNTS.expenseAccount, debit: recognized, credit: null, memo: `${periodStr} accrual — ${form.name}` })
      newJournalEntries.push({ id: `je-${formattedRecDate}-liab`, date: formattedRecDate, account: form.liabilityAccount || DEFAULT_ACCOUNTS.liabilityAccount, debit: null, credit: recognized, memo: `${periodStr} accrual — ${form.name}` })
    } else if (isCommission) {
      newJournalEntries.push({ id: `je-${formattedRecDate}-exp`, date: formattedRecDate, account: form.commExpenseAccount || DEFAULT_ACCOUNTS.commExpenseAccount, debit: recognized, credit: null, memo: `${periodStr} commission amortization — ${form.partyName}` })
      newJournalEntries.push({ id: `je-${formattedRecDate}-defcomm`, date: formattedRecDate, account: form.defCommAccount || DEFAULT_ACCOUNTS.defCommAccount, debit: null, credit: recognized, memo: `${periodStr} commission amortization — ${form.partyName}` })
    }

    openingBalance = closingBalance
    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  // Settlement entry for Accrued
  if (isAccrued && form.expectedPaymentDate) {
    newJournalEntries.push({ id: 'je-settle-liab', date: form.expectedPaymentDate, account: form.liabilityAccount || DEFAULT_ACCOUNTS.liabilityAccount, debit: totalValue, credit: null, memo: `Settlement — ${form.name}` })
    newJournalEntries.push({ id: 'je-settle-cash', date: form.expectedPaymentDate, account: '1000 — Cash', debit: null, credit: totalValue, memo: `Settlement — ${form.name}` })
  }

  return { schedule: newSchedule, journalEntries: newJournalEntries }
}

export interface WriteOffInput {
  subtype: WaterfallSubtype
  totalAmount: number
  partyName?: string
  name?: string
  /** Account overrides (free-text codes); blanks fall back to DEFAULT_ACCOUNTS. */
  accounts?: Partial<Record<keyof typeof DEFAULT_ACCOUNTS, string>>
  schedule: ScheduleRow[]
  journalEntries: JournalEntry[]
}

/**
 * Recognize the entire remaining balance in a single month (`asOf`, "YYYY-MM"):
 * truncates the schedule at the cutoff month, sets the cutoff row's remaining
 * to zero, and appends a balanced write-off journal entry. Returns the inputs
 * unchanged when the balance is already zero by the cutoff or `asOf` is invalid.
 */
export function applyWriteOff(input: WriteOffInput, asOf: string): WaterfallResult {
  const cutoffYYYYMM = monthKeyToYYYYMM(asOf)
  if (cutoffYYYYMM == null) {
    return { schedule: input.schedule, journalEntries: input.journalEntries }
  }
  const asOfYear = Math.floor(cutoffYYYYMM / 100)
  const asOfMonth = cutoffYYYYMM % 100 // 0-indexed

  const sched = input.schedule
  const journalEntries = [...input.journalEntries]
  const val = Number(input.totalAmount) || 0

  let recognizedToDateBeforeCutoff = 0
  const newSchedule: ScheduleRow[] = []
  for (const p of sched) {
    const pYYYYMM = periodToYYYYMM(p.period)
    if (pYYYYMM == null) {
      newSchedule.push(p)
      continue
    }
    if (pYYYYMM < cutoffYYYYMM) {
      recognizedToDateBeforeCutoff += p.recognized
      newSchedule.push(p)
    }
  }

  const balanceToWriteOff = Math.max(0, val - recognizedToDateBeforeCutoff)
  if (balanceToWriteOff <= 0) {
    return { schedule: input.schedule, journalEntries: input.journalEntries }
  }

  const writeOffPeriodDate = new Date(asOfYear, asOfMonth, 1)
  const writeOffPeriodStr = writeOffPeriodDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  const existing = sched.find((p) => p.period === writeOffPeriodStr)
  if (existing) {
    newSchedule.push({
      ...existing,
      recognized: balanceToWriteOff,
      closing: 0,
      remaining: 0,
      cumulative: recognizedToDateBeforeCutoff + balanceToWriteOff,
    })
  } else {
    newSchedule.push({
      id: `s-${writeOffPeriodStr}-wo`,
      period: writeOffPeriodStr,
      billed: 0,
      cashReceived: 0,
      opening: balanceToWriteOff,
      recognized: balanceToWriteOff,
      closing: 0,
      cumulative: recognizedToDateBeforeCutoff + balanceToWriteOff,
      remaining: 0,
    })
  }

  // Write-off journal entry on the last day of the cutoff month
  const writeOffRecDate = new Date(asOfYear, asOfMonth + 1, 0)
  const formattedRecDate = toYMD(writeOffRecDate)

  const acc = { ...DEFAULT_ACCOUNTS, ...(input.accounts ?? {}) }
  const who = input.partyName || input.name || ''

  if (input.subtype === 'Deferred Revenue') {
    journalEntries.push({ id: `je-${formattedRecDate}-dr-wo`, date: formattedRecDate, account: acc.deferredAccount, debit: balanceToWriteOff, credit: null, memo: `${writeOffPeriodStr} revenue write off — ${who}` })
    journalEntries.push({ id: `je-${formattedRecDate}-rev-wo`, date: formattedRecDate, account: acc.revenueAccount, debit: null, credit: balanceToWriteOff, memo: `${writeOffPeriodStr} revenue write off — ${who}` })
  } else if (input.subtype === 'Prepaid Expenses') {
    journalEntries.push({ id: `je-${formattedRecDate}-exp-wo`, date: formattedRecDate, account: acc.expenseAccount, debit: balanceToWriteOff, credit: null, memo: `${writeOffPeriodStr} prepaid write off — ${who}` })
    journalEntries.push({ id: `je-${formattedRecDate}-prepaid-wo`, date: formattedRecDate, account: acc.prepaidAccount, debit: null, credit: balanceToWriteOff, memo: `${writeOffPeriodStr} prepaid write off — ${who}` })
  } else if (input.subtype === 'Accrued Expenses') {
    journalEntries.push({ id: `je-${formattedRecDate}-liab-wo`, date: formattedRecDate, account: acc.liabilityAccount, debit: balanceToWriteOff, credit: null, memo: `${writeOffPeriodStr} accrual write off — ${who}` })
    journalEntries.push({ id: `je-${formattedRecDate}-exp-wo`, date: formattedRecDate, account: acc.expenseAccount, debit: null, credit: balanceToWriteOff, memo: `${writeOffPeriodStr} accrual write off — ${who}` })
  } else if (input.subtype === 'Deferred Commission') {
    journalEntries.push({ id: `je-${formattedRecDate}-exp-wo`, date: formattedRecDate, account: acc.commExpenseAccount, debit: balanceToWriteOff, credit: null, memo: `${writeOffPeriodStr} commission write off — ${who}` })
    journalEntries.push({ id: `je-${formattedRecDate}-defcomm-wo`, date: formattedRecDate, account: acc.defCommAccount, debit: null, credit: balanceToWriteOff, memo: `${writeOffPeriodStr} commission write off — ${who}` })
  }

  return { schedule: newSchedule, journalEntries }
}

/**
 * Input shape for `buildMonthlyJournalEntries`. `SavedWaterfall` is a superset
 * and assignable here; declared structurally to keep the engine free of
 * `waterfallData` (which itself imports from this file).
 */
export interface MonthlyJournalInput {
  id: string
  name: string
  form: WaterfallForm
  schedule: ScheduleRow[]
}

/** One row of the consolidated monthly journal-entries view (one debit/credit side). */
export interface MonthlyJournalRow {
  id: string
  date: string // YYYY-MM-DD (last day of the asOf month)
  contractName: string
  subtype: WaterfallSubtype
  account: string
  debit: number | null
  credit: number | null
  memo: string
}

/**
 * Build the consolidated monthly journal entries across every waterfall whose
 * schedule recognizes something in the `asOf` month ("YYYY-MM"). Emits the same
 * debit/credit pairs `calculateWaterfall` produces for that period, falling
 * back to `DEFAULT_ACCOUNTS` when a form leaves an account blank.
 */
export function buildMonthlyJournalEntries(
  items: MonthlyJournalInput[],
  asOf: string,
): MonthlyJournalRow[] {
  const cutoff = monthKeyToYYYYMM(asOf)
  if (cutoff == null) return []
  const asOfYear = Math.floor(cutoff / 100)
  const asOfMonth = cutoff % 100 // 0-indexed

  const recDate = toYMD(new Date(asOfYear, asOfMonth + 1, 0))
  const rows: MonthlyJournalRow[] = []

  for (const item of items) {
    const period = item.schedule.find((p) => periodToYYYYMM(p.period) === cutoff)
    if (!period || !(period.recognized > 0)) continue

    const { form, name } = item
    const periodStr = period.period
    const partyName = form.partyName
    const recognized = period.recognized
    const idPrefix = `mje-${item.id}-${recDate}`

    if (form.type === 'Deferred Revenue') {
      const memo = `${periodStr} revenue recognition — ${partyName}`
      rows.push({ id: `${idPrefix}-dr`, date: recDate, contractName: name, subtype: form.type, account: form.deferredAccount || DEFAULT_ACCOUNTS.deferredAccount, debit: recognized, credit: null, memo })
      rows.push({ id: `${idPrefix}-rev`, date: recDate, contractName: name, subtype: form.type, account: form.revenueAccount || DEFAULT_ACCOUNTS.revenueAccount, debit: null, credit: recognized, memo })
    } else if (form.type === 'Prepaid Expenses') {
      const memo = `${periodStr} amortization — ${partyName}`
      rows.push({ id: `${idPrefix}-exp`, date: recDate, contractName: name, subtype: form.type, account: form.expenseAccount || DEFAULT_ACCOUNTS.expenseAccount, debit: recognized, credit: null, memo })
      rows.push({ id: `${idPrefix}-prepaid`, date: recDate, contractName: name, subtype: form.type, account: form.prepaidAccount || DEFAULT_ACCOUNTS.prepaidAccount, debit: null, credit: recognized, memo })
    } else if (form.type === 'Accrued Expenses') {
      const memo = `${periodStr} accrual — ${name}`
      rows.push({ id: `${idPrefix}-exp`, date: recDate, contractName: name, subtype: form.type, account: form.expenseAccount || DEFAULT_ACCOUNTS.expenseAccount, debit: recognized, credit: null, memo })
      rows.push({ id: `${idPrefix}-liab`, date: recDate, contractName: name, subtype: form.type, account: form.liabilityAccount || DEFAULT_ACCOUNTS.liabilityAccount, debit: null, credit: recognized, memo })
    } else if (form.type === 'Deferred Commission') {
      const memo = `${periodStr} commission amortization — ${partyName}`
      rows.push({ id: `${idPrefix}-exp`, date: recDate, contractName: name, subtype: form.type, account: form.commExpenseAccount || DEFAULT_ACCOUNTS.commExpenseAccount, debit: recognized, credit: null, memo })
      rows.push({ id: `${idPrefix}-defcomm`, date: recDate, contractName: name, subtype: form.type, account: form.defCommAccount || DEFAULT_ACCOUNTS.defCommAccount, debit: null, credit: recognized, memo })
    }
  }

  return rows
}

export interface AsOfAggregate {
  recognizedToDate: number
  currentBalance: number
}

/**
 * Roll up a single schedule "as of" a month ("YYYY-MM"), for the dashboard.
 * Uses the latest schedule row at or before the cutoff: `recognizedToDate` is
 * its cumulative recognition, `currentBalance` its closing balance (which builds
 * up for Accrued and draws down for the other subtypes). Returns zeros / the
 * first row's opening when nothing has been recognized yet.
 */
export function aggregateAsOf(schedule: ScheduleRow[], asOf: string): AsOfAggregate {
  const cutoff = monthKeyToYYYYMM(asOf)
  if (cutoff == null || schedule.length === 0) {
    return { recognizedToDate: 0, currentBalance: schedule[0]?.opening ?? 0 }
  }
  let last: ScheduleRow | null = null
  for (const row of schedule) {
    const pY = periodToYYYYMM(row.period)
    if (pY == null) continue
    if (pY <= cutoff) last = row
  }
  if (!last) {
    return { recognizedToDate: 0, currentBalance: schedule[0]?.opening ?? 0 }
  }
  return { recognizedToDate: last.cumulative, currentBalance: last.closing }
}
