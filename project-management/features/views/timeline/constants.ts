/**
 * Timeline layout constants.
 */
import type { ZoomLevel } from './types'

export const ROW_H = 36
export const HEADER_H = 56
export const RAIL_W_DEFAULT = 260
export const RAIL_W_MIN = 180
export const RAIL_W_MAX = 420

export const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year']

/** Pixels per time unit at each zoom level. */
export const PX_PER_UNIT: Record<ZoomLevel, number> = {
  day: 28,
  week: 44,
  month: 72,
  quarter: 96,
  year: 120,
}

export const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
}

/** Critical-path highlight — distinct from section/assignee bar colors. */
export const CRITICAL_PATH_COLOR = '#E53935'
export const CRITICAL_PATH_GLOW = 'rgba(229, 57, 53, 0.5)'
