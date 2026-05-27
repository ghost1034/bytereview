// Adapters between the persisted `analyses` row (type="waterfall") and the
// in-memory waterfall shapes the UI works with.
//
// A waterfall is stored as:
//   row.config  = WaterfallForm   (its `type` field holds the subtype)
//   row.data    = ScheduleRow[]
//   row.results = JournalEntry[]
// All three are JSONB (`unknown` in the generated types), so we parse defensively.

import type { AnalyticsAnalysis } from './types'
import { aggregateAsOf } from './waterfallEngine'
import {
  createDefaultWaterfallForm,
  type JournalEntry,
  type ScheduleRow,
  type WaterfallForm,
  type WaterfallSubtype,
} from './waterfallTypes'

export interface SavedWaterfall {
  id: string
  name: string
  clientId: string | null
  status: string
  form: WaterfallForm
  schedule: ScheduleRow[]
  journalEntries: JournalEntry[]
  createdAt?: string | null
  updatedAt?: string | null
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/** Convert a persisted analysis row into the UI's waterfall shape. */
export function toSavedWaterfall(row: AnalyticsAnalysis): SavedWaterfall {
  const stored = (row.config ?? {}) as Partial<WaterfallForm>
  // Merge over defaults so a partial/older config never yields undefined fields.
  const form: WaterfallForm = { ...createDefaultWaterfallForm(), ...stored, name: row.name }
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id ?? null,
    status: row.status ?? 'draft',
    form,
    schedule: asArray<ScheduleRow>(row.data),
    journalEntries: asArray<JournalEntry>(row.results),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface WaterfallRollup extends SavedWaterfall {
  subtype: WaterfallSubtype
  recognizedToDate: number
  currentBalance: number
}

/** Roll a saved waterfall up "as of" a "YYYY-MM" month for the dashboard/list. */
export function rollupAsOf(w: SavedWaterfall, asOf: string): WaterfallRollup {
  const { recognizedToDate, currentBalance } = aggregateAsOf(w.schedule, asOf)
  return { ...w, subtype: w.form.type, recognizedToDate, currentBalance }
}
