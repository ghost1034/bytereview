import { describe, expect, it } from 'vitest'
import type { InvoiceStatus } from '../../types'
import { formatInvoiceCount, INVOICE_STATUS_LABELS } from './invoicePresentation'

const ALL_INVOICE_STATUSES: InvoiceStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'paid',
  'partial',
  'overdue',
  'void',
  'written_off',
]

describe('invoice presentation', () => {
  it('provides a display label for every invoice lifecycle status', () => {
    expect(Object.keys(INVOICE_STATUS_LABELS)).toEqual(ALL_INVOICE_STATUSES)
    expect(INVOICE_STATUS_LABELS).toEqual({
      draft: 'Draft',
      pending_approval: 'Pending approval',
      approved: 'Approved',
      sent: 'Sent',
      paid: 'Paid',
      partial: 'Partial',
      overdue: 'Overdue',
      void: 'Void',
      written_off: 'Written off',
    })
  })

  it.each([
    [0, '0 invoices'],
    [1, '1 invoice'],
    [2, '2 invoices'],
  ])('formats an invoice count of %i', (count, expected) => {
    expect(formatInvoiceCount(count)).toBe(expected)
  })
})
