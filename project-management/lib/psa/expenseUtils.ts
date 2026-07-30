import type { Expense, ExpenseCategory } from '../../types'
import { PASS_THROUGH_CATEGORIES } from './constants'

/** Compute billable amount with markup or pass-through. */
export function computeBillableAmount(
  totalAmount: number,
  billable: boolean,
  passThrough: boolean,
  markupPercent: number
): number {
  if (!billable) return 0
  if (passThrough) return totalAmount
  return Math.round(totalAmount * (1 + markupPercent / 100) * 100) / 100
}

/** Default pass-through for legal fee categories. */
export function defaultPassThrough(category: string): boolean {
  return PASS_THROUGH_CATEGORIES.has(category as ExpenseCategory)
}

/** Normalize expense totals. */
export function expenseTotals(amount: number, taxAmount: number): { totalAmount: number } {
  const totalAmount = Math.round((amount + taxAmount) * 100) / 100
  return { totalAmount }
}

/** Mileage amount from miles × rate. */
export function mileageAmount(miles: number, rate: number): number {
  return Math.round(miles * rate * 100) / 100
}

/** Get display total for an expense row. */
export function expenseDisplayTotal(e: Expense): number {
  return e.totalAmount ?? e.amount
}
