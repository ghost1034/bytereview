/** OCR receipt scan seam (Veryfi / Mindee / Textract in production). */
export type OcrReceiptResult = {
  status?: 'extracted' | 'manual_required'
  reason?: string
  vendor?: string
  date?: string
  amount?: number
  taxAmount?: number
  currency?: string
}

export interface OcrAdapter {
  readonly configured: boolean
  scanReceipt(input: { file?: File; objectName?: string; workspaceId?: string }): Promise<OcrReceiptResult>
}
