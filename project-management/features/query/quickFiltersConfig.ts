/**
 * Quick-filter chip definitions for the filter builder.
 */
import type { FilterClause } from '../../lib/query/types'
import { QUICK_FILTER_PRESETS } from '../../lib/query/constants'

export type QuickFilterPreset = (typeof QUICK_FILTER_PRESETS)[number]

export { QUICK_FILTER_PRESETS as quickFiltersConfig }

/** Check whether a quick filter is active in the current query. */
export function isQuickFilterActive(filters: FilterClause[], preset: QuickFilterPreset): boolean {
  const { clause } = preset
  return filters.some(
    (f) => f.field === clause.field && f.op === clause.op && f.value === clause.value
  )
}

/** Toggle a quick filter clause on/off. */
export function toggleQuickFilter(filters: FilterClause[], preset: QuickFilterPreset): FilterClause[] {
  const { clause } = preset
  const exists = isQuickFilterActive(filters, preset)
  if (exists) {
    return filters.filter(
      (f) => !(f.field === clause.field && f.op === clause.op && f.value === clause.value)
    )
  }
  let next = [...filters, clause]
  if (preset.id === 'incomplete') {
    next = next.filter((f) => !(f.field === 'completed' && f.op === 'eq' && f.value === true))
  }
  if (preset.id === 'completed_only') {
    next = next.filter((f) => !(f.field === 'completed' && f.op === 'eq' && f.value === false))
  }
  return next
}
