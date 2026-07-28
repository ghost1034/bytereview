/**
 * My Tasks additive types — layout and per-user section overrides on Task/User.
 */
import type { Task, User } from '../../types'

export const BUILTIN_SECTION_IDS = [
  'recently_assigned',
  'today',
  'upcoming',
  'later',
  'completed',
] as const

export type BuiltinMyTasksSectionId = (typeof BUILTIN_SECTION_IDS)[number]
export type MyTasksSectionId = BuiltinMyTasksSectionId | string

export type MyTasksCustomSection = { id: string; name: string }

/** Per-workspace personal section layout stored on User. */
export type MyTasksLayout = {
  sectionOrder: MyTasksSectionId[]
  hiddenSectionIds: MyTasksSectionId[]
  customSections: MyTasksCustomSection[]
  sectionLabels?: Partial<Record<BuiltinMyTasksSectionId, string>>
  showSubtasksWhenParentUnassigned?: boolean
}

export type UserMyTasksFields = { myTasksLayout?: Record<string, MyTasksLayout> }
export type TaskMyTasksFields = { myTasksSection?: Record<string, MyTasksSectionId> }

export type UserWithMyTasks = User & UserMyTasksFields
export type TaskWithMyTasks = Task & TaskMyTasksFields

export type MyTasksViewMode = 'list' | 'board' | 'calendar'

export type MyTasksSection = {
  id: MyTasksSectionId
  label: string
  tasks: Task[]
  builtin: boolean
}

export const DEFAULT_MY_TASKS_LAYOUT: MyTasksLayout = {
  sectionOrder: ['recently_assigned', 'today', 'upcoming', 'later', 'completed'],
  hiddenSectionIds: ['completed'],
  customSections: [],
  showSubtasksWhenParentUnassigned: true,
}

export const BUILTIN_SECTION_LABELS: Record<BuiltinMyTasksSectionId, string> = {
  recently_assigned: 'Recently assigned',
  today: 'Today',
  upcoming: 'Upcoming',
  later: 'Later',
  completed: 'Completed',
}

/** Poetic empty-state copy per built-in section. */
export const SECTION_EMPTY_MESSAGES: Record<BuiltinMyTasksSectionId, string> = {
  recently_assigned: 'Nothing new on your plate.',
  today: 'A quiet inbox. A good day to start something.',
  upcoming: 'Nothing due this week.',
  later: 'No undated or later tasks.',
  completed: 'Completed tasks will gather here.',
}
