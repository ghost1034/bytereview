/**
 * Task grouping for list, board, calendar, timeline, and gantt views.
 */
import { startOfDay } from 'date-fns'
import type { CustomField, Task } from '../../types'
import type { ApplyQueryContext, GroupingKey, TaskGroup } from './types'
import { dueBucket } from './dueBuckets'

const DUE_LABELS: Record<string, string> = {
  __overdue__: 'Overdue',
  __today__: 'Today',
  __tomorrow__: 'Tomorrow',
  __this_week__: 'This week',
  __next_week__: 'Next week',
  __later__: 'Later',
  __no_date__: 'No date',
}

const DUE_ORDER = ['__overdue__', '__today__', '__tomorrow__', '__this_week__', '__next_week__', '__later__', '__no_date__']

function findCustomFieldByName(fields: CustomField[], name: string): CustomField | undefined {
  return fields.find((f) => f.name.toLowerCase() === name.toLowerCase())
}

function enumLabel(field: CustomField | undefined, optionId: string | null | undefined): string {
  if (!optionId) return 'Empty'
  const opt = field?.options?.find((o) => o.id === optionId)
  return opt?.label ?? optionId
}

function enumColor(field: CustomField | undefined, optionId: string | null | undefined): string | undefined {
  if (!optionId) return undefined
  return field?.options?.find((o) => o.id === optionId)?.color
}

function groupKeyForTask(task: Task, groupBy: GroupingKey, ctx: ApplyQueryContext): { key: string; label: string; color?: string } {
  const { projectId, sections = [], users = [], tags = [], projects = [], customFields = [] } = ctx

  switch (groupBy) {
    case 'section': {
      const sid = task.sectionIdByProject[projectId] ?? '__none__'
      const section = sections.find((s) => s.id === sid)
      return { key: sid, label: section?.name ?? 'No section' }
    }
    case 'assignee': {
      const uid = task.assigneeId ?? '__unassigned__'
      if (uid === '__unassigned__') return { key: uid, label: 'Unassigned' }
      const user = users.find((u) => u.id === uid)
      return { key: uid, label: user?.name ?? 'Unknown' }
    }
    case 'dueOn': {
      const bucket = task.dueOn ? dueBucket(task) ?? '__no_date__' : '__no_date__'
      return { key: bucket, label: DUE_LABELS[bucket] ?? bucket }
    }
    case 'completed':
      return task.completed
        ? { key: 'completed', label: 'Completed' }
        : { key: 'incomplete', label: 'Incomplete' }
    case 'tag': {
      const tid = task.tagIds[0] ?? '__untagged__'
      if (tid === '__untagged__') return { key: tid, label: 'Untagged' }
      const tag = tags.find((t) => t.id === tid)
      return { key: tid, label: tag?.name ?? 'Tag', color: tag?.color }
    }
    case 'project': {
      const pid = task.projectIds[0] ?? '__none__'
      const project = projects.find((p) => p.id === pid)
      return { key: pid, label: project?.name ?? 'No project', color: project?.color }
    }
    case 'priority': {
      const field = findCustomFieldByName(customFields, 'priority')
      const val = field ? (task.customFieldValues[field.id]?.type === 'dropdown' ? task.customFieldValues[field.id]?.value : null) : null
      const optionId = typeof val === 'string' ? val : null
      return { key: optionId ?? '__empty__', label: enumLabel(field, optionId), color: enumColor(field, optionId) }
    }
    case 'status': {
      const field = findCustomFieldByName(customFields, 'status')
      const val = field ? (task.customFieldValues[field.id]?.type === 'dropdown' ? task.customFieldValues[field.id]?.value : null) : null
      const optionId = typeof val === 'string' ? val : null
      return { key: optionId ?? '__empty__', label: enumLabel(field, optionId), color: enumColor(field, optionId) }
    }
    default:
      if (groupBy.startsWith('customField:')) {
        const fieldId = groupBy.slice('customField:'.length)
        const field = customFields.find((f) => f.id === fieldId)
        const cv = task.customFieldValues[fieldId]
        if (!cv || cv.value === null || cv.value === undefined || (Array.isArray(cv.value) && !cv.value.length)) {
          return { key: '__empty__', label: 'Empty' }
        }
        if (cv.type === 'dropdown') {
          const optionId = cv.value as string
          return { key: optionId, label: enumLabel(field, optionId), color: enumColor(field, optionId) }
        }
        return { key: String(cv.value), label: String(cv.value) }
      }
      return { key: 'all', label: 'All tasks' }
  }
}

function compareGroupKeys(a: string, b: string, groupBy: GroupingKey, ctx: ApplyQueryContext): number {
  if (groupBy === 'dueOn') return DUE_ORDER.indexOf(a) - DUE_ORDER.indexOf(b)
  if (groupBy === 'assignee') {
    const me = ctx.currentUserId
    if (a === me) return -1
    if (b === me) return 1
    if (a === '__unassigned__') return 1
    if (b === '__unassigned__') return -1
  }
  if (groupBy === 'section') {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    const orderA = ctx.sections?.find((s) => s.id === a)?.order ?? 999
    const orderB = ctx.sections?.find((s) => s.id === b)?.order ?? 999
    return orderA - orderB
  }
  return a.localeCompare(b)
}

/** Group tasks into ordered sections for rendering. */
export function groupTasks(tasks: Task[], groupBy: GroupingKey | undefined, ctx: ApplyQueryContext): TaskGroup[] {
  if (!groupBy || groupBy === 'none') {
    return [{ key: 'all', label: 'All tasks', tasks }]
  }

  const map = new Map<string, TaskGroup>()
  tasks.forEach((task) => {
    const { key, label, color } = groupKeyForTask(task, groupBy, ctx)
    const existing = map.get(key)
    if (existing) existing.tasks.push(task)
    else map.set(key, { key, label, color, tasks: [task] })
  })

  if (groupBy === 'section' && ctx.sections?.length) {
    ctx.sections.forEach((section) => {
      if (!map.has(section.id)) {
        map.set(section.id, { key: section.id, label: section.name, tasks: [] })
      }
    })
  }

  return [...map.values()].sort((a, b) => compareGroupKeys(a.key, b.key, groupBy, ctx))
}
