import type { InvoiceStatus } from '../../types'

export const INVOICE_STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  sent: 'Sent',
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  void: 'Void',
  written_off: 'Written off',
} satisfies Record<InvoiceStatus, string>

export function formatInvoiceCount(count: number): string {
  return `${count} ${count === 1 ? 'invoice' : 'invoices'}`
}
