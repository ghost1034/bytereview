import { newId } from '../ids'
import { now, toISODate } from '../time'
import type { Expense, Invoice, InvoiceLineItem, Payment, TimeEntry } from '../../types'
import { entryHours } from './timeEntryUtils'

export type GenerateInvoiceInput = {
  workspaceId: string
  clientId: string
  clientName: string
  matterId?: string
  periodStart: string
  periodEnd: string
  timeEntries: TimeEntry[]
  expenses: Expense[]
  invoiceNumber: string
  currency?: string
  taxAmount?: number
  discountAmount?: number
  trustApplied?: number
}

/** Build draft invoice from approved unbilled entries. */
export function buildInvoiceFromEntries(input: GenerateInvoiceInput): Invoice {
  const lineItems: InvoiceLineItem[] = []
  let subtotalFees = 0
  let subtotalExpenses = 0

  input.timeEntries.forEach((e) => {
    const hrs = entryHours(e)
    const rate = e.rateSnapshot ?? 0
    const amt = e.amount ?? rate * hrs
    subtotalFees += amt
    lineItems.push({
      description: e.description,
      quantity: hrs,
      rate,
      type: 'time',
      sourceId: e.id,
    })
  })

  input.expenses.forEach((e) => {
    const amt = e.billableAmount ?? e.totalAmount ?? e.amount
    subtotalExpenses += amt
    lineItems.push({
      description: `${e.description} (${e.category})`,
      quantity: 1,
      rate: amt,
      type: 'expense',
      sourceId: e.id,
    })
  })

  const discount = input.discountAmount ?? 0
  const tax = input.taxAmount ?? 0
  const trust = input.trustApplied ?? 0
  const total = subtotalFees + subtotalExpenses - discount + tax - trust
  const due = new Date()
  due.setDate(due.getDate() + 30)

  return {
    id: newId(),
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    clientName: input.clientName,
    matterId: input.matterId,
    invoiceNumber: input.invoiceNumber,
    issueDate: toISODate(new Date()),
    status: 'draft',
    amount: total,
    total,
    dueOn: toISODate(due),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    timeEntryIds: input.timeEntries.map((e) => e.id),
    expenseIds: input.expenses.map((e) => e.id),
    subtotalFees,
    subtotalExpenses,
    discountAmount: discount,
    taxAmount: tax,
    trustApplied: trust,
    amountPaid: 0,
    amountOutstanding: total,
    currency: input.currency ?? 'USD',
    lineItems,
    createdAt: now(),
  }
}

/** Patch invoice after payment recorded. */
export function invoiceAfterPayment(invoice: Invoice, paymentAmount: number): Partial<Invoice> {
  const paid = (invoice.amountPaid ?? 0) + paymentAmount
  const total = invoice.total ?? invoice.amount
  const outstanding = Math.max(0, total - paid)
  let status = invoice.status
  if (outstanding <= 0) status = 'paid'
  else if (paid > 0) status = 'partial'
  return { amountPaid: paid, amountOutstanding: outstanding, status, paidAt: outstanding <= 0 ? now() : invoice.paidAt }
}

/** Build payment record. */
export function buildPayment(
  workspaceId: string,
  invoiceId: string,
  amount: number,
  currency: string,
  method: Payment['method'],
  recordedById: string,
  reference?: string
): Payment {
  return {
    id: newId(),
    workspaceId,
    invoiceId,
    amount,
    currency,
    method,
    reference,
    paidAt: toISODate(new Date()),
    recordedById,
    createdAt: now(),
  }
}
