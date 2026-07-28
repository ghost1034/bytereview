import type { Invoice } from '../../types'

/** Accounting system export seam (QuickBooks / Xero / NetSuite). */
export interface AccountingAdapter {
  readonly provider: 'stub' | 'quickbooks' | 'xero' | 'netsuite'
  exportInvoice(invoice: Invoice): Promise<{ externalId?: string; json: string }>
  syncPayment?(invoiceId: string, amount: number): Promise<void>
}
