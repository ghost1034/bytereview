import { stubAccountingAdapter } from './stubAdapter'
import type { AccountingAdapter } from './types'

export function getAccountingAdapter(): AccountingAdapter {
  return stubAccountingAdapter
}

export type { AccountingAdapter } from './types'
