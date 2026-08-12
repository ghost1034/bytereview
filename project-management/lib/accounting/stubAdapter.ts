import type { Invoice } from '../../types'
import type { AccountingAdapter } from './types'

/** Local JSON export; unsupported ERP connections remain hidden. */
export const stubAccountingAdapter: AccountingAdapter = {
  provider: 'stub',
  async exportInvoice(invoice) {
    return { json: JSON.stringify(invoice, null, 2) }
  },
}
