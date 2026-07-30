import type { ID, ISODateTime } from '../../types'

export type BillingInquiryInput = {
  workspaceId: ID
  userId: ID
  type: 'upgrade' | 'manage_payment'
  message?: string
}

export type PaymentAdapter = {
  createBillingInquiry(input: BillingInquiryInput): Promise<{ id: ID }>
  openUpgradeFlow?(workspaceId: ID): Promise<void>
  openBillingPortal?(workspaceId: ID): Promise<void>
  readonly capabilities: {
    usesExternalCheckout: boolean
    provider: 'local' | 'stripe' | 'adyen'
  }
}
