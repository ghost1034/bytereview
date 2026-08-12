import type { OcrAdapter, OcrReceiptResult } from './types'

/** V1 stub — returns empty; user enters amounts manually. */
export const stubOcrAdapter: OcrAdapter = {
  configured: false,
  async scanReceipt(): Promise<OcrReceiptResult> {
    return { status: 'manual_required', reason: 'integration_unavailable' }
  },
}
