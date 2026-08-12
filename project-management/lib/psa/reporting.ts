/**
 * PSA dashboard metrics — WIP, realization, utilization, effective rate, AR aging, trust.
 */
import type { Client, Expense, Invoice, TimeEntry, TrustTransaction, User } from '../../types'
import { arAgingByCurrency, effectiveRate, realizationRate, utilizationPercent, wipByCurrency, wipExpenses, wipTime } from '../billing/selectors'
import { entryHours } from './timeEntryUtils'

export type PsaReportFilters = {
  workspaceId: string
  clientId?: string
  matterId?: string
  userId?: string
  periodStart?: string
  periodEnd?: string
}

function inPeriod(date: string, start?: string, end?: string): boolean {
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

function filterEntries(entries: TimeEntry[], f: PsaReportFilters): TimeEntry[] {
  return entries.filter(
    (e) =>
      e.workspaceId === f.workspaceId &&
      (!f.clientId || e.clientId === f.clientId) &&
      (!f.matterId || e.matterId === f.matterId) &&
      (!f.userId || e.userId === f.userId) &&
      inPeriod(e.date, f.periodStart, f.periodEnd)
  )
}

function filterExpenses(expenses: Expense[], f: PsaReportFilters): Expense[] {
  return expenses.filter(
    (e) =>
      e.workspaceId === f.workspaceId &&
      (!f.clientId || e.clientId === f.clientId) &&
      (!f.matterId || e.matterId === f.matterId) &&
      (!f.userId || e.userId === f.userId) &&
      inPeriod(e.date, f.periodStart, f.periodEnd)
  )
}

/** WIP summary for dashboards. */
export function computeWip(entries: TimeEntry[], expenses: Expense[], filters: PsaReportFilters) {
  const te = filterEntries(entries, filters)
  const ex = filterExpenses(expenses, filters)
  return { time: wipTime(te), expenses: wipExpenses(ex), total: wipTime(te) + wipExpenses(ex) }
}

export function computeWipByCurrency(entries: TimeEntry[], expenses: Expense[], filters: PsaReportFilters) {
  return wipByCurrency(filterEntries(entries, filters), filterExpenses(expenses, filters))
}

/** Realization ratio 0–1. */
export function computeRealization(entries: TimeEntry[], filters: PsaReportFilters): number {
  return realizationRate(filterEntries(entries, filters))
}

/** Utilization for a user against weekly target. */
export function computeUtilization(
  entries: TimeEntry[],
  filters: PsaReportFilters,
  targetHours: number
): number {
  const te = filterEntries(entries, filters)
  const billable = te.filter((e) => e.billable).reduce((s, e) => s + entryHours(e), 0)
  return utilizationPercent(billable, targetHours)
}

/** Effective hourly rate from billed entries. */
export function computeEffectiveRate(entries: TimeEntry[], filters: PsaReportFilters): number {
  return effectiveRate(filterEntries(entries, filters))
}

export function computeEffectiveRateByCurrency(entries: TimeEntry[], filters: PsaReportFilters): Record<string, number> {
  const grouped = groupEntriesByCurrency(filterEntries(entries, filters).filter((entry) => entry.billable && entry.status === 'billed'))
  return Object.fromEntries(Object.entries(grouped).map(([currency, rows]) => [currency, effectiveRate(rows)]))
}

export function computeRealizationByCurrency(entries: TimeEntry[], filters: PsaReportFilters): Record<string, number> {
  const grouped = groupEntriesByCurrency(filterEntries(entries, filters).filter((entry) => entry.status === 'billed'))
  return Object.fromEntries(Object.entries(grouped).map(([currency, rows]) => [currency, realizationRate(rows)]))
}

function groupEntriesByCurrency(entries: TimeEntry[]): Record<string, TimeEntry[]> {
  return entries.reduce<Record<string, TimeEntry[]>>((groups, entry) => {
    const currency = entry.currency ?? 'USD'
    groups[currency] = [...(groups[currency] ?? []), entry]
    return groups
  }, {})
}

/** AR aging chart data. */
export function computeArAging(invoices: Invoice[], filters: PsaReportFilters) {
  const inv = invoices.filter((i) => i.workspaceId === filters.workspaceId)
  return Object.entries(arAgingByCurrency(inv)).flatMap(([bucket, values]) => Object.entries(values).map(([currency, value]) => ({ label: `${bucket} ${currency}`, value })))
}

/** WIP aging by entry age bucket. */
export function computeWipAging(entries: TimeEntry[], expenses: Expense[], filters: PsaReportFilters, asOf = new Date()) {
  const buckets: Record<string, number> = {}
  const today = asOf.getTime()
  const add = (date: string, amount: number, currency: string) => {
    const days = Math.floor((today - new Date(date).getTime()) / 86400000)
    const age = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'
    const bucket = `${age} ${currency}`
    buckets[bucket] = (buckets[bucket] ?? 0) + amount
  }
  filterEntries(entries, filters)
    .filter((e) => e.billable && !e.invoiceId)
    .forEach((e) => add(e.date, e.amount ?? (e.rateSnapshot ?? 0) * entryHours(e), e.currency ?? 'USD'))
  filterExpenses(expenses, filters)
    .filter((e) => e.billable && !e.invoiceId)
    .forEach((e) => add(e.date, e.billableAmount ?? e.amount, e.currency ?? 'USD'))
  return Object.entries(buckets).map(([label, value]) => ({ label, value }))
}

/** Utilization by user for bar chart. */
export function utilizationByUser(entries: TimeEntry[], users: User[], filters: PsaReportFilters, targetHours: number) {
  return users.map((u) => ({
    label: u.name.split(' ')[0] ?? u.name,
    value: computeUtilization(entries, { ...filters, userId: u.id }, targetHours),
  }))
}

/** Trust balances by client. */
export function trustBalancesByClient(clients: Client[], txs: TrustTransaction[], filters: PsaReportFilters) {
  return clients
    .filter((c) => c.workspaceId === filters.workspaceId && !c.archived)
    .map((c) => ({
      label: c.name,
      currency: c.defaultCurrency,
      value: c.retainerBalance ?? txs.filter((t) => t.clientId === c.id).slice(-1)[0]?.balanceAfter ?? 0,
    }))
    .filter((r) => r.value !== 0)
    .map((row) => ({ label: `${row.label} (${row.currency})`, value: row.value }))
}
