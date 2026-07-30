/**
 * PSA dashboard metrics — WIP, realization, utilization, effective rate, AR aging, trust.
 */
import type { Client, Expense, Invoice, TimeEntry, TrustTransaction, User } from '../../types'
import { arAgingBuckets, effectiveRate, realizationRate, utilizationPercent, wipExpenses, wipTime } from '../billing/selectors'
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

/** AR aging chart data. */
export function computeArAging(invoices: Invoice[], filters: PsaReportFilters) {
  const inv = invoices.filter((i) => i.workspaceId === filters.workspaceId)
  return Object.entries(arAgingBuckets(inv)).map(([label, value]) => ({ label, value }))
}

/** WIP aging by entry age bucket. */
export function computeWipAging(entries: TimeEntry[], expenses: Expense[], filters: PsaReportFilters, asOf = new Date()) {
  const buckets: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  const today = asOf.getTime()
  const add = (date: string, amount: number) => {
    const days = Math.floor((today - new Date(date).getTime()) / 86400000)
    if (days <= 30) buckets['0-30'] += amount
    else if (days <= 60) buckets['31-60'] += amount
    else if (days <= 90) buckets['61-90'] += amount
    else buckets['90+'] += amount
  }
  filterEntries(entries, filters)
    .filter((e) => e.billable && !e.invoiceId)
    .forEach((e) => add(e.date, e.amount ?? (e.rateSnapshot ?? 0) * entryHours(e)))
  filterExpenses(expenses, filters)
    .filter((e) => e.billable && !e.invoiceId)
    .forEach((e) => add(e.date, e.billableAmount ?? e.amount))
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
      value: c.retainerBalance ?? txs.filter((t) => t.clientId === c.id).slice(-1)[0]?.balanceAfter ?? 0,
    }))
    .filter((r) => r.value !== 0)
}
