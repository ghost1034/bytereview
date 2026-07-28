/**
 * Default view query and quick-filter presets.
 */
import type { FilterClause, ViewQuery } from './types'

export const DEFAULT_VIEW_QUERY: ViewQuery = {
  filters: [],
  hiddenFields: [],
  showCompleted: true,
  density: 'comfortable',
  collapsedSectionIds: [],
  search: '',
  showSubtasksInline: true,
}

/** One-click filter chips for the filter builder. */
export const QUICK_FILTER_PRESETS: Array<{ id: string; label: string; clause: FilterClause }> = [
  { id: 'my_tasks', label: 'Just my tasks', clause: { field: 'assigneeId', op: 'eq', value: '__me__' } },
  { id: 'due_week', label: 'Due this week', clause: { field: 'dueOn', op: 'eq', value: '__this_week__' } },
  { id: 'overdue', label: 'Overdue', clause: { field: 'dueOn', op: 'eq', value: '__overdue__' } },
  { id: 'incomplete', label: 'Incomplete only', clause: { field: 'completed', op: 'eq', value: false } },
  { id: 'completed_only', label: 'Completed only', clause: { field: 'completed', op: 'eq', value: true } },
]

/** Legacy export for existing imports. */
export const QUICK_FILTERS: FilterClause[] = QUICK_FILTER_PRESETS.map((p) => p.clause)

export const SORT_FIELD_OPTIONS: Array<{ field: string; label: string }> = [
  { field: 'dueOn', label: 'Due date' },
  { field: 'startOn', label: 'Start date' },
  { field: 'name', label: 'Alphabetical' },
  { field: 'createdAt', label: 'Created date' },
  { field: 'modifiedAt', label: 'Modified date' },
  { field: 'likes', label: 'Likes' },
  { field: 'subtaskProgress', label: 'Subtask progress %' },
]

export const GROUP_BY_OPTIONS: Array<{ key: import('./types').GroupingKey; label: string }> = [
  { key: 'none', label: 'No grouping' },
  { key: 'section', label: 'Section' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'dueOn', label: 'Due date' },
  { key: 'completed', label: 'Completed' },
  { key: 'tag', label: 'Tag' },
  { key: 'project', label: 'Project' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
]

export const LIST_HIDEABLE_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'assignee', label: 'Assignee' },
  { id: 'dueOn', label: 'Due date' },
  { id: 'startOn', label: 'Start date' },
  { id: 'tags', label: 'Tags' },
  { id: 'projects', label: 'Projects' },
  { id: 'createdAt', label: 'Created' },
  { id: 'modifiedAt', label: 'Modified' },
]
