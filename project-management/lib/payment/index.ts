import { localPaymentAdapter } from './localAdapter'
import type { PaymentAdapter } from './types'

/** Returns the configured payment adapter (V1: local billing inquiries). */
export function getPaymentAdapter(): PaymentAdapter {
  return localPaymentAdapter
}

export type { PaymentAdapter, BillingInquiryInput } from './types'
