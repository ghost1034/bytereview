/**
 * Filter clause evaluation against tasks.
 */
import type { CustomField, Task } from '../../types'
import type { ApplyQueryContext, FilterClause, FilterOp } from './types'
import { dueBucket } from './dueBuckets'

function stripHtml(html: string | undefined): string {
  return (html ?? '').replace(/<[^>]+>/g, '')
}

function normalizeOp(op: FilterOp): FilterOp {
  if (op === 'is') return 'eq'
  if (op === 'is_not') return 'neq'
  if (op === 'is_any_of') return 'in'
  if (op === 'is_none_of') return 'neq'
  if (op === 'does_not_contain') return 'neq'
  return op
}

function fieldValue(task: Task, field: string, ctx: ApplyQueryContext): unknown {
  const { projectId, customFields = [] } = ctx
  switch (field) {
    case 'name':
      return task.name
    case 'assignee':
    case 'assigneeId':
      return task.assigneeId ?? null
    case 'collaborator':
    case 'collaboratorIds':
      return task.collaboratorIds
    case 'project':
    case 'projectId':
      return task.projectIds
    case 'section':
    case 'sectionId':
      return task.sectionIdByProject[projectId] ?? null
    case 'tag':
    case 'tagIds':
    case 'tags':
      return task.tagIds
    case 'due':
    case 'dueOn':
      return task.dueOn ?? null
    case 'startOn':
      return task.startOn ?? null
    case 'completed':
      return task.completed
    case 'completedBy':
    case 'completedById':
      return task.completedById ?? null
    case 'completedAt':
      return task.completedAt ?? null
    case 'createdAt':
      return task.createdAt
    case 'modifiedAt':
      return task.modifiedAt
    case 'notes':
    case 'description':
      return stripHtml(task.notes)
    case 'priority':
      return findNamedCustomFieldValue(task, customFields, 'priority')
    case 'status':
      return findNamedCustomFieldValue(task, customFields, 'status')
    default:
      if (field.startsWith('customField:')) {
        const id = field.slice('customField:'.length)
        return readCustomFieldValue(task, id)
      }
      return null
  }
}

function findNamedCustomFieldValue(task: Task, fields: CustomField[], name: string): unknown {
  const field = fields.find((f) => f.name.toLowerCase() === name.toLowerCase())
  if (!field) return null
  return readCustomFieldValue(task, field.id)
}

function readCustomFieldValue(task: Task, fieldId: string): unknown {
  const cv = task.customFieldValues[fieldId]
  if (!cv) return null
  switch (cv.type) {
    case 'text':
      return cv.value
    case 'number':
      return cv.value
    case 'date':
      return cv.value
    case 'people':
      return cv.value
    case 'dropdown':
      return cv.value
    case 'multi_select':
      return cv.value
    case 'checkbox':
      return cv.value
    case 'formula':
      return cv.value
    default:
      return null
  }
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

function dueBucketOrNone(task: Task): string {
  return task.dueOn ? dueBucket(task) ?? '__no_date__' : '__no_date__'
}

function matchSpecialDue(clause: FilterClause, task: Task): boolean | null {
  if (clause.field !== 'dueOn' && clause.field !== 'due') return null
  const bucket = dueBucketOrNone(task)
  const v = String(clause.value)
  if (v === '__this_week__') return bucket === '__this_week__' || bucket === '__today__' || bucket === '__tomorrow__'
  if (v === '__overdue__') return bucket === '__overdue__'
  if (v === '__today__') return bucket === '__today__'
  if (v === '__tomorrow__') return bucket === '__tomorrow__'
  if (v === '__next_week__') return bucket === '__next_week__'
  if (v === '__later__') return bucket === '__later__'
  if (v === '__no_date__') return bucket === '__no_date__'
  return null
}

/** Evaluate a single filter clause against one task. */
export function matchClause(task: Task, clause: FilterClause, ctx: ApplyQueryContext): boolean {
  const op = normalizeOp(clause.op)
  const raw = clause.value

  if (raw === '__me__' && (clause.field === 'assigneeId' || clause.field === 'assignee')) {
    return task.assigneeId === ctx.currentUserId
  }

  const specialDue = matchSpecialDue(clause, task)
  if (specialDue !== null) return specialDue

  const value = fieldValue(task, clause.field, ctx)

  if (op === 'is_empty') return isEmptyValue(value)
  if (op === 'is_not_empty') return !isEmptyValue(value)

  if (op === 'contains') {
    const hay = String(value ?? '').toLowerCase()
    const needle = String(raw ?? '').toLowerCase()
    if (Array.isArray(value)) return value.some((v) => String(v).toLowerCase().includes(needle))
    return hay.includes(needle)
  }

  if (op === 'in' || clause.op === 'is_any_of') {
    const list = Array.isArray(raw) ? raw : [raw]
    if (Array.isArray(value)) return list.some((item) => value.includes(String(item)))
    return list.map(String).includes(String(value))
  }

  if (clause.op === 'is_none_of') {
    const list = Array.isArray(raw) ? raw : [raw]
    if (Array.isArray(value)) return !list.some((item) => value.includes(String(item)))
    return !list.map(String).includes(String(value))
  }

  if (op === 'before') {
    if (!value) return false
    return String(value) < String(raw)
  }
  if (op === 'after') {
    if (!value) return false
    return String(value) > String(raw)
  }

  if (typeof value === 'number' && typeof raw === 'number') {
    if (op === 'eq') return value === raw
    if (op === 'neq') return value !== raw
    if (op === 'gt') return value > raw
    if (op === 'lt') return value < raw
    if (op === 'gte') return value >= raw
    if (op === 'lte') return value <= raw
  }

  if (typeof value === 'boolean') {
    if (op === 'eq') return value === raw
    if (op === 'neq') return value !== raw
  }

  if (Array.isArray(value)) {
    const target = String(raw)
    if (op === 'eq') return value.includes(target)
    if (op === 'neq') return !value.includes(target)
  }

  const left = String(value ?? '').toLowerCase()
  const right = String(raw ?? '').toLowerCase()
  if (op === 'eq') return left === right || String(value) === String(raw)
  if (op === 'neq') return left !== right && String(value) !== String(raw)
  if (op === 'gt') return String(value) > String(raw)
  if (op === 'lt') return String(value) < String(raw)
  if (op === 'gte') return String(value) >= String(raw)
  if (op === 'lte') return String(value) <= String(raw)

  return true
}

/** Apply all filter clauses (AND) to a task list. */
export function applyFilters(tasks: Task[], filters: FilterClause[], ctx: ApplyQueryContext): Task[] {
  if (!filters.length) return tasks
  return tasks.filter((task) => filters.every((clause) => matchClause(task, clause, ctx)))
}
