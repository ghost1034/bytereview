/** OCR receipt scan seam (Veryfi / Mindee / Textract in production). */
export type OcrReceiptResult = {
  vendor?: string
  date?: string
  amount?: number
  taxAmount?: number
  currency?: string
}

export interface OcrAdapter {
  readonly configured: boolean
  scanReceipt(file: File): Promise<OcrReceiptResult>
}
