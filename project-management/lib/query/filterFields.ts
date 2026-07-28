/**
 * Build filter field definitions from project context.
 */
import type { CustomField, Section, Tag, User } from '../../types'
import type { FilterFieldDef, FilterOp } from './types'

const BASE_FIELDS: FilterFieldDef[] = [
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'assigneeId', label: 'Assignee', kind: 'user' },
  { id: 'collaboratorIds', label: 'Collaborator', kind: 'users' },
  { id: 'projectId', label: 'Project', kind: 'project' },
  { id: 'sectionId', label: 'Section', kind: 'section' },
  { id: 'tagIds', label: 'Tag', kind: 'tags' },
  { id: 'dueOn', label: 'Due date', kind: 'date' },
  { id: 'startOn', label: 'Start date', kind: 'date' },
  { id: 'completed', label: 'Completed', kind: 'boolean' },
  { id: 'completedById', label: 'Completed by', kind: 'user' },
  { id: 'completedAt', label: 'Completed at', kind: 'date' },
  { id: 'createdAt', label: 'Created at', kind: 'date' },
  { id: 'modifiedAt', label: 'Modified at', kind: 'date' },
]

/** Operators available per field kind. */
export function operatorsForField(field: FilterFieldDef): FilterOp[] {
  switch (field.kind) {
    case 'text':
      return ['contains', 'eq', 'neq', 'is_empty', 'is_not_empty']
    case 'user':
      return ['eq', 'neq', 'is_empty', 'is_not_empty']
    case 'users':
    case 'tags':
    case 'project':
    case 'section':
      return ['in', 'is_empty', 'is_not_empty']
    case 'enum':
      return ['eq', 'neq', 'in', 'is_empty', 'is_not_empty']
    case 'date':
      return ['eq', 'before', 'after', 'is_empty', 'is_not_empty']
    case 'boolean':
      return ['eq']
    case 'number':
      return ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'is_empty', 'is_not_empty']
    default:
      return ['eq', 'neq']
  }
}

/** Merge built-in and custom field definitions. */
export function buildFilterFields(customFields: CustomField[] = []): FilterFieldDef[] {
  const cfDefs: FilterFieldDef[] = customFields.map((f) => {
    let kind: FilterFieldDef['kind'] = 'text'
    if (f.type === 'number') kind = 'number'
    else if (f.type === 'date') kind = 'date'
    else if (f.type === 'dropdown') kind = 'enum'
    else if (f.type === 'multi_select') kind = 'tags'
    else if (f.type === 'people') kind = 'users'
    else if (f.type === 'checkbox') kind = 'boolean'
    return { id: `customField:${f.id}`, label: f.name, kind, customFieldId: f.id }
  })

  const priority = cfDefs.find((d) => d.label.toLowerCase() === 'priority')
  const status = cfDefs.find((d) => d.label.toLowerCase() === 'status')
  const rest = cfDefs.filter((d) => !['priority', 'status'].includes(d.label.toLowerCase()))

  const fields = [...BASE_FIELDS]
  if (priority) fields.push({ ...priority, id: 'priority', label: 'Priority' })
  if (status) fields.push({ ...status, id: 'status', label: 'Status' })
  return [...fields, ...rest]
}

export type FilterContext = {
  members: User[]
  sections: Section[]
  tags: Tag[]
  customFields: CustomField[]
}
