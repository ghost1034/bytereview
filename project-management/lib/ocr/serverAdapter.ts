import { tasklyticApiJson } from '../tasklyticApi'
import type { OcrAdapter, OcrReceiptResult } from './types'

export const serverOcrAdapter: OcrAdapter = {
  configured: true,
  async scanReceipt(input): Promise<OcrReceiptResult> {
    if (!input.objectName || !input.workspaceId) {
      return { status: 'manual_required', reason: 'receipt_not_uploaded' }
    }
    const result = await tasklyticApiJson<{
      status: 'extracted' | 'manual_required'
      reason?: string
      receipt?: Omit<OcrReceiptResult, 'status' | 'reason'>
    }>('/integrations/vertex/receipts:extract', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: input.workspaceId, objectName: input.objectName }),
    })
    return { status: result.status, reason: result.reason, ...(result.receipt ?? {}) }
  },
}
