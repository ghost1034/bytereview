/**
 * PSA billing selectors — WIP, realization, utilization, AR aging.
 * WIP = unbilled approved/submitted billable time (rate × hours) + unbilled expenses (billableAmount).
 */
import type { Expense, Invoice, TimeEntry } from '../../types'
import { entryHours } from '../psa/timeEntryUtils'
import { aggregateMoney, type MoneyByCurrency } from './currency'

const WIP_TIME_STATUSES = new Set(['approved', 'submitted'])
const WIP_EXP_STATUSES = new Set(['approved', 'submitted'])

/** Sum WIP time fees from entries. */
export function wipTime(entries: TimeEntry[]): number {
  return entries
    .filter(
      (e) =>
        e.billable &&
        !e.invoiceId &&
        WIP_TIME_STATUSES.has(e.status ?? 'draft') &&
        (e.approved || e.status === 'submitted' || e.status === 'approved')
    )
    .reduce((sum, e) => sum + (e.amount ?? (e.rateSnapshot ?? 0) * entryHours(e)), 0)
}

/** Sum WIP expense fees. */
export function wipExpenses(expenses: Expense[]): number {
  return expenses
    .filter(
      (e) =>
        e.billable &&
        !e.invoiceId &&
        WIP_EXP_STATUSES.has(e.status ?? 'draft')
    )
    .reduce((sum, e) => sum + (e.billableAmount ?? e.totalAmount ?? e.amount), 0)
}

/** Total WIP (time + expenses). */
export function wipTotal(entries: TimeEntry[], expenses: Expense[]): number {
  return wipTime(entries) + wipExpenses(expenses)
}

/** Realization = billed / standard (rate snapshot × hours). */
export function realizationRate(entries: TimeEntry[]): number {
  const billed = entries.filter((e) => e.status === 'billed')
  const standard = billed.reduce((s, e) => s + (e.rateSnapshot ?? 0) * entryHours(e), 0)
  const actual = billed.reduce((s, e) => s + (e.amount ?? 0), 0)
  return standard > 0 ? actual / standard : 0
}

/** Utilization = billable hours / target hours. */
export function utilizationPercent(billableHours: number, targetHours: number): number {
  return targetHours > 0 ? (billableHours / targetHours) * 100 : 0
}

/** Effective rate = billed amount / billable hours. */
export function effectiveRate(entries: TimeEntry[]): number {
  const billed = entries.filter((e) => e.billable && e.status === 'billed')
  const hours = billed.reduce((s, e) => s + entryHours(e), 0)
  const amount = billed.reduce((s, e) => s + (e.amount ?? 0), 0)
  return hours > 0 ? amount / hours : 0
}

/** AR aging buckets for outstanding invoices. */
export function arAgingBuckets(invoices: Invoice[], asOf = new Date()): Record<string, number> {
  const buckets: Record<string, number> = { Current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  const today = asOf.toISOString().slice(0, 10)
  invoices
    .filter((i) => {
      const outstanding = i.amountOutstanding ?? i.amount - (i.amountPaid ?? 0)
      return outstanding > 0 && i.status !== 'void' && i.status !== 'paid'
    })
    .forEach((inv) => {
      const outstanding = inv.amountOutstanding ?? inv.amount - (inv.amountPaid ?? 0)
      const due = inv.dueOn
      const daysPast = Math.floor((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
      if (daysPast <= 0) buckets.Current += outstanding
      else if (daysPast <= 30) buckets['1-30'] += outstanding
      else if (daysPast <= 60) buckets['31-60'] += outstanding
      else if (daysPast <= 90) buckets['61-90'] += outstanding
      else buckets['90+'] += outstanding
    })
  return buckets
}

/** Outstanding AR separated first by aging bucket and then by ISO currency. */
export function arAgingByCurrency(
  invoices: Invoice[],
  asOf = new Date(),
): Record<string, MoneyByCurrency> {
  const result: Record<string, MoneyByCurrency> = {
    Current: {}, '1-30': {}, '31-60': {}, '61-90': {}, '90+': {},
  }
  const today = asOf.toISOString().slice(0, 10)
  for (const invoice of invoices) {
    const outstanding = invoice.amountOutstanding ?? invoice.amount - (invoice.amountPaid ?? 0)
    if (outstanding <= 0 || ['void', 'paid', 'written_off'].includes(invoice.status)) continue
    const daysPast = Math.floor((new Date(today).getTime() - new Date(invoice.dueOn).getTime()) / 86400000)
    const bucket = daysPast <= 0 ? 'Current' : daysPast <= 30 ? '1-30' : daysPast <= 60 ? '31-60' : daysPast <= 90 ? '61-90' : '90+'
    result[bucket] = aggregateMoney([
      ...Object.entries(result[bucket]).map(([currency, amount]) => ({ currency, amount })),
      { currency: invoice.currency ?? 'USD', amount: outstanding, fxQuoteId: invoice.fxQuoteId },
    ])
  }
  return result
}

export function invoiceOutstandingByCurrency(invoices: Invoice[]): MoneyByCurrency {
  return aggregateMoney(invoices
    .filter((invoice) => !['void', 'paid', 'written_off'].includes(invoice.status))
    .map((invoice) => ({
      currency: invoice.currency ?? 'USD',
      amount: invoice.amountOutstanding ?? invoice.amount - (invoice.amountPaid ?? 0),
      fxQuoteId: invoice.fxQuoteId,
    })))
}

export function wipByCurrency(entries: TimeEntry[], expenses: Expense[]): MoneyByCurrency {
  return aggregateMoney([
    ...entries.filter((entry) => entry.billable && !entry.invoiceId && WIP_TIME_STATUSES.has(entry.status ?? 'draft'))
      .map((entry) => ({ currency: entry.currency ?? 'USD', amount: entry.amount ?? (entry.rateSnapshot ?? 0) * entryHours(entry) })),
    ...expenses.filter((expense) => expense.billable && !expense.invoiceId && WIP_EXP_STATUSES.has(expense.status ?? 'draft'))
      .map((expense) => ({ currency: expense.currency ?? 'USD', amount: expense.billableAmount ?? expense.totalAmount ?? expense.amount })),
  ])
}
