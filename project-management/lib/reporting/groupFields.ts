/**
 * Group-by field options per chart data source.
 */
import type { Chart, CustomField } from '../../types'

export type GroupFieldOption = { id: string; label: string }

const TASK_BUILTIN: GroupFieldOption[] = [
  { id: 'assigneeId', label: 'Assignee' },
  { id: 'completed', label: 'Completion' },
  { id: 'project', label: 'Project' },
  { id: 'section', label: 'Section' },
  { id: 'tag', label: 'Tag' },
  { id: 'createdAt', label: 'Created week' },
  { id: 'dueOn', label: 'Due date' },
]

const PROJECT_BUILTIN: GroupFieldOption[] = [
  { id: 'status', label: 'Status' },
  { id: 'teamId', label: 'Team' },
  { id: 'ownerId', label: 'Owner' },
]

const GOAL_BUILTIN: GroupFieldOption[] = [
  { id: 'status', label: 'Status' },
  { id: 'ownerId', label: 'Owner' },
]

const PORTFOLIO_BUILTIN: GroupFieldOption[] = [{ id: 'status', label: 'Status' }]

/** List group-by fields for a chart source, including custom fields. */
export function groupFieldsForSource(source: Chart['source'], customFields: CustomField[]): GroupFieldOption[] {
  const base =
    source === 'tasks'
      ? TASK_BUILTIN
      : source === 'projects'
        ? PROJECT_BUILTIN
        : source === 'goals'
          ? GOAL_BUILTIN
          : PORTFOLIO_BUILTIN
  const custom = customFields.map((f) => ({
    id: f.id.startsWith('customField:') ? f.id : `customField:${f.id}`,
    label: f.name,
  }))
  return [...base, ...custom]
}

/** Numeric measure fields for sum/avg by source. */
export function measureFieldsForSource(source: Chart['source'], customFields: CustomField[]): GroupFieldOption[] {
  if (source === 'projects') return [{ id: 'taskCount', label: 'Task count' }]
  if (source === 'goals') return [{ id: 'progress', label: 'Progress %' }]
  const numeric = customFields.filter((f) => f.type === 'number' || f.type === 'formula')
  return numeric.map((f) => ({ id: f.id, label: f.name }))
}

/** Date fields for burnup / line charts. */
export function dateFieldsForSource(source: Chart['source'], customFields: CustomField[]): GroupFieldOption[] {
  if (source !== 'tasks') {
    return [
      { id: 'createdAt', label: 'Created date' },
      { id: 'modifiedAt', label: 'Modified date' },
    ]
  }
  const customDates = customFields.filter((f) => f.type === 'date').map((f) => ({ id: f.id, label: f.name }))
  return [
    { id: 'createdAt', label: 'Created date' },
    { id: 'completedAt', label: 'Completion date' },
    { id: 'dueOn', label: 'Due date' },
    { id: 'startOn', label: 'Start date' },
    ...customDates,
  ]
}
