/**
 * V1 payment adapter — records billing inquiries for sales follow-up.
 */
import { newId } from '../ids'
import { now } from '../time'
import type { BillingInquiry } from '../../types'
import { useBillingInquiriesStore } from '../../stores/entities'
import type { BillingInquiryInput, PaymentAdapter } from './types'

export const localPaymentAdapter: PaymentAdapter = {
  capabilities: {
    usesExternalCheckout: false,
    provider: 'local',
  },

  async createBillingInquiry(input: BillingInquiryInput) {
    const inquiry: BillingInquiry = {
      id: newId(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      message: input.message,
      status: 'open',
      createdAt: now(),
    }
    await useBillingInquiriesStore.getState().add(inquiry)
    return { id: inquiry.id }
  },
}
