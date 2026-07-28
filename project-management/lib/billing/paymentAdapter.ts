import type { Payment } from '../../types'

/** Payment recording seam — V1 uses manual entry in UI. */
export interface PaymentAdapter {
  readonly provider: 'stub' | 'stripe' | 'quickbooks'
  recordPayment(payment: Payment): Promise<{ success: boolean }>
}

export const stubPaymentAdapter: PaymentAdapter = {
  provider: 'stub',
  async recordPayment() {
    return { success: true }
  },
}

export function getPaymentAdapter(): PaymentAdapter {
  return stubPaymentAdapter
}
