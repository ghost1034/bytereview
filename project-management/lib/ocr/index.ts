import { stubOcrAdapter } from './stubAdapter'
import { serverOcrAdapter } from './serverAdapter'
import { usesTasklyticBackend } from '../runtimeMode'

export function getOcrAdapter() {
  return usesTasklyticBackend() ? serverOcrAdapter : stubOcrAdapter
}

export type { OcrAdapter, OcrReceiptResult } from './types'
