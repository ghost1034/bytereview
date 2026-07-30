import { stubOcrAdapter } from './stubAdapter'

export function getOcrAdapter() {
  return stubOcrAdapter
}

export type { OcrAdapter, OcrReceiptResult } from './types'
