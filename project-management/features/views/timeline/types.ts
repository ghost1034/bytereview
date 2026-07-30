/**
 * Shared timeline / Gantt types.
 */
import type { Task } from '../../../types'

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year'
export type ColorBy = 'section' | 'assignee' | 'tag' | 'priority'
export type RowsBy = 'none' | 'section' | 'assignee' | 'tag'
export type TimelineVariant = 'timeline' | 'gantt'

export type TaskSpan = { start: Date; end: Date }

export type TimelineRow =
  | { kind: 'section'; sectionId: string; label: string }
  | { kind: 'swimlane'; key: string; label: string }
  | { kind: 'task'; task: Task; rowIndex: number }

export type BaselineSnapshot = {
  snappedAt: string
  tasks: Record<string, { startOn?: string; dueOn?: string }>
}

export type TimelineUiState = {
  zoom: ZoomLevel
  panX: number
  colorBy: ColorBy
  rowsBy: RowsBy
  autoShift: boolean
  highlightCriticalPath: boolean
  showBaseline: boolean
  baseline: BaselineSnapshot | null
  railCollapsed: boolean
  railWidth: number
  collapsedSectionIds: string[]
}

export type DependencyLink = {
  fromId: string
  toId: string
  fromRow: number
  toRow: number
}
