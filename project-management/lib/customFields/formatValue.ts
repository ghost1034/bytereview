/**
 * Display formatting for custom field values.
 */
import type { CustomField } from '../../types'
import { asExtendedField } from './fieldConfig'

/** Format a numeric custom field value for display. */
export function formatNumberDisplay(field: CustomField, value: number | null): string {
  if (value == null) return '—'
  const ext = asExtendedField(field)
  const precision = ext.numberPrecision ?? (field.numberFormat === 'percent' ? 0 : 2)
  const rounded =
    precision >= 0 ? Number(value.toFixed(precision)) : value
  const label = ext.customLabel ? ` ${ext.customLabel}` : ''
  if (field.numberFormat === 'percent') return `${rounded}%${label}`
  if (field.numberFormat === 'currency') {
    return `${field.currencySymbol ?? '$'}${rounded.toLocaleString()}${label}`
  }
  return `${rounded.toLocaleString()}${label}`
}

/** Validate a number entry against field min/max/precision. */
export function validateNumberInput(
  field: CustomField,
  raw: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const num = Number(trimmed)
  if (Number.isNaN(num)) return { ok: false, error: 'Enter a valid number' }
  const ext = asExtendedField(field)
  if (ext.numberMin != null && num < ext.numberMin) {
    return { ok: false, error: `Minimum is ${ext.numberMin}` }
  }
  if (ext.numberMax != null && num > ext.numberMax) {
    return { ok: false, error: `Maximum is ${ext.numberMax}` }
  }
  return { ok: true, value: num }
}
