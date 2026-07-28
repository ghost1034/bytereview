/**
 * Task sorting for view queries.
 */
import type { CustomField, Task } from '../../types'
import type { ApplyQueryContext, ViewQuery } from './types'
import { resolveSort } from './viewQueryHelpers'

function readCustomFieldSort(task: Task, fieldId: string): string | number {
  const cv = task.customFieldValues[fieldId]
  if (!cv) return ''
  switch (cv.type) {
    case 'number':
      return cv.value ?? -Infinity
    case 'date':
      return cv.value ?? '9999'
    case 'text':
      return (cv.value ?? '').toLowerCase()
    case 'dropdown':
      return cv.value ?? ''
    case 'checkbox':
      return cv.value ? 1 : 0
    default:
      return ''
  }
}

function sortValue(task: Task, field: string, customFields: CustomField[] = []): string | number {
  switch (field) {
    case 'name':
      return task.name.toLowerCase()
    case 'dueOn':
      return task.dueOn ?? '9999'
    case 'startOn':
      return task.startOn ?? '9999'
    case 'createdAt':
      return task.createdAt
    case 'modifiedAt':
      return task.modifiedAt
    case 'likes':
      return task.likedByIds.length
    case 'subtaskProgress':
      return task.completed ? 100 : 0
    default:
      if (field.startsWith('customField:')) {
        return readCustomFieldSort(task, field.slice('customField:'.length))
      }
      {
        const cf = customFields.find((f) => f.name.toLowerCase() === field.toLowerCase())
        if (cf) return readCustomFieldSort(task, cf.id)
      }
      return task.name.toLowerCase()
  }
}

/** Sort tasks in-place copy according to query.sortBy. */
export function sortTasks(tasks: Task[], query: ViewQuery, ctx: ApplyQueryContext): Task[] {
  const sort = resolveSort(query)
  if (!sort) return tasks
  const dir = sort.direction === 'asc' ? 1 : -1
  const customFields = ctx.customFields ?? []
  return [...tasks].sort((a, b) => {
    const av = sortValue(a, sort.field, customFields)
    const bv = sortValue(b, sort.field, customFields)
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return a.name.localeCompare(b.name)
  })
}
