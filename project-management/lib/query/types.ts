/**
 * View query types — shared filter/sort/group across project views and search.
 */
import type { CustomField, Project, Section, Tag, Task, User } from '../../types'

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'in'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'is'
  | 'is_not'
  | 'is_any_of'
  | 'is_none_of'
  | 'before'
  | 'after'
  | 'does_not_contain'

export type FilterClause = {
  field: string
  op: FilterOp
  value: unknown
}

export type GroupingKey =
  | 'none'
  | 'section'
  | 'assignee'
  | 'dueOn'
  | 'completed'
  | 'tag'
  | 'project'
  | 'priority'
  | 'status'
  | `customField:${string}`

export type ViewDensity = 'compact' | 'comfortable' | 'detailed'

export type ViewQuery = {
  filters: FilterClause[]
  groupBy?: GroupingKey
  sortBy?: { field: string; direction: 'asc' | 'desc' }
  /** Legacy alias for sortBy — kept for existing view integrations. */
  sort?: { field: string; direction: 'asc' | 'desc' }
  hiddenFields: string[]
  showCompleted: boolean
  /** Legacy alias — when set, overrides showCompleted. */
  hiddenCompleted?: boolean
  density: ViewDensity
  swimlaneBy?: GroupingKey
  /** Legacy board swimlane toggle. */
  boardSwimlanes?: boolean
  collapsedSectionIds: string[]
  search: string
  showSubtasksInline?: boolean
}

export type ApplyQueryContext = {
  projectId: string
  currentUserId?: string | null
  sections?: Section[]
  users?: User[]
  tags?: Tag[]
  customFields?: CustomField[]
  projects?: Project[]
  /** When true, include completed tasks regardless of showCompleted. */
  forceShowCompleted?: boolean
}

export type TaskGroup = {
  key: string
  label: string
  color?: string
  tasks: Task[]
}

export type FilterFieldDef = {
  id: string
  label: string
  kind: 'text' | 'user' | 'users' | 'enum' | 'date' | 'boolean' | 'number' | 'tags' | 'section' | 'project'
  customFieldId?: string
}
