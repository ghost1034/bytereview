import type { Invoice } from '../../types'
import type { AccountingAdapter } from './types'

/** V1 stub — JSON export only; bind real ERP in Settings → Integrations. */
export const stubAccountingAdapter: AccountingAdapter = {
  provider: 'stub',
  async exportInvoice(invoice) {
    return { json: JSON.stringify(invoice, null, 2) }
  },
}
