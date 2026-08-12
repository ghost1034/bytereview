/**
 * Group-by field options per chart data source.
 */
import type { Chart, CustomField } from '../../types'
import { reportingSource } from './sourceRegistry'

export type GroupFieldOption = { id: string; label: string }

/** List group-by fields for a chart source, including custom fields. */
export function groupFieldsForSource(source: Chart['source'], customFields: CustomField[]): GroupFieldOption[] {
  const base = reportingSource(source).groupFields
  const custom = customFields.map((f) => ({
    id: f.id.startsWith('customField:') ? f.id : `customField:${f.id}`,
    label: f.name,
  }))
  return [...base, ...custom]
}

/** Numeric measure fields for sum/avg by source. */
export function measureFieldsForSource(source: Chart['source'], customFields: CustomField[]): GroupFieldOption[] {
  const builtins = reportingSource(source).measureFields
  const numeric = customFields.filter((f) => f.type === 'number' || f.type === 'formula')
  return [...builtins, ...numeric.map((f) => ({ id: f.id, label: f.name }))]
}

/** Date fields for burnup / line charts. */
export function dateFieldsForSource(source: Chart['source'], customFields: CustomField[]): GroupFieldOption[] {
  const customDates = customFields.filter((f) => f.type === 'date').map((f) => ({ id: f.id, label: f.name }))
  return [...reportingSource(source).dateFields, ...customDates]
}
