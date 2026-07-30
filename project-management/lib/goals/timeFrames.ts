/** Quarter and year presets for goal time frames. */
import { toISODate } from '../time'

export type TimeFramePreset =
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'H1'
  | 'H2'
  | 'annual'
  | 'custom'

export type TimeFrameRange = { start: string; end: string }

/** Preset labels for the create/edit modal. */
export const TIMEFRAME_PRESET_LABELS: Record<TimeFramePreset, string> = {
  Q1: 'Q1',
  Q2: 'Q2',
  Q3: 'Q3',
  Q4: 'Q4',
  H1: 'H1',
  H2: 'H2',
  annual: 'Annual',
  custom: 'Custom',
}

function quarterRange(year: number, q: 0 | 1 | 2 | 3): TimeFrameRange {
  const start = new Date(year, q * 3, 1)
  const end = new Date(year, q * 3 + 3, 0)
  return { start: toISODate(start), end: toISODate(end) }
}

/** Resolve a preset to ISO start/end for the given calendar year. */
export function resolveTimeFramePreset(preset: TimeFramePreset, year = new Date().getFullYear()): TimeFrameRange {
  switch (preset) {
    case 'Q1':
      return quarterRange(year, 0)
    case 'Q2':
      return quarterRange(year, 1)
    case 'Q3':
      return quarterRange(year, 2)
    case 'Q4':
      return quarterRange(year, 3)
    case 'H1':
      return { start: toISODate(new Date(year, 0, 1)), end: toISODate(new Date(year, 6, 0)) }
    case 'H2':
      return { start: toISODate(new Date(year, 6, 1)), end: toISODate(new Date(year, 12, 0)) }
    case 'annual':
      return { start: toISODate(new Date(year, 0, 1)), end: toISODate(new Date(year, 11, 31)) }
    default:
      return quarterRange(year, Math.floor(new Date().getMonth() / 3) as 0 | 1 | 2 | 3)
  }
}

/** Current calendar quarter key (Q1–Q4). */
export function currentQuarterKey(): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const q = Math.floor(new Date().getMonth() / 3)
  return (['Q1', 'Q2', 'Q3', 'Q4'] as const)[q]
}

/** Whether a goal's timeFrame overlaps a filter quarter or year. */
export function matchesTimeFilter(
  timeFrame: TimeFrameRange,
  filter: 'all' | 'quarter' | 'year',
  year = new Date().getFullYear()
): boolean {
  if (filter === 'all') return true
  if (filter === 'year') {
    return timeFrame.start.startsWith(String(year)) || timeFrame.end.startsWith(String(year))
  }
  const q = resolveTimeFramePreset(currentQuarterKey(), year)
  return timeFrame.start <= q.end && timeFrame.end >= q.start
}
