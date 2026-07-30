/**
 * My Tasks mutations — layout persistence and section assignment on tasks.
 */
import { addDays, startOfToday } from 'date-fns'
import { newId } from '../../lib/ids'
import { updateTask } from '../../lib/taskActions'
import { toISODate } from '../../lib/time'
import type { Task } from '../../types'
import { useTasksStore, useUsersStore } from '../../stores/entities'
import {
  DEFAULT_MY_TASKS_LAYOUT,
  type MyTasksLayout,
  type MyTasksSectionId,
  type TaskMyTasksFields,
  type UserMyTasksFields,
  type UserWithMyTasks,
} from './types'
import { isBuiltinSectionId, normalizeLayout } from './myTasksUtils'

import type { User } from '../../types'

type TaskPatch = Partial<Task & TaskMyTasksFields>

function asUser(user: User | undefined): UserWithMyTasks | undefined {
  return user as UserWithMyTasks | undefined
}

/** Read layout for a user in a workspace. */
export function getMyTasksLayout(userId: string, workspaceId: string): MyTasksLayout {
  const user = asUser(useUsersStore.getState().getById(userId))
  return normalizeLayout(user?.myTasksLayout?.[workspaceId])
}

/** Persist layout for a user in a workspace. */
export async function saveMyTasksLayout(
  userId: string,
  workspaceId: string,
  layout: MyTasksLayout
): Promise<void> {
  const user = asUser(useUsersStore.getState().getById(userId))
  if (!user) return
  const next: UserMyTasksFields = {
    myTasksLayout: {
      ...(user.myTasksLayout ?? {}),
      [workspaceId]: normalizeLayout(layout),
    },
  }
  await useUsersStore.getState().update(userId, next as Partial<typeof user>)
}

/** Assign a task to a personal section for the current user. */
export async function assignTaskToMySection(
  taskId: string,
  userId: string,
  sectionId: MyTasksSectionId,
  actorId: string
): Promise<void> {
  const prev = useTasksStore.getState().getById(taskId) as (Task & TaskMyTasksFields) | undefined
  if (!prev) return
  const patch: TaskPatch = {}
  const map = { ...(prev.myTasksSection ?? {}) }
  if (isBuiltinSectionId(sectionId)) {
    map[userId] = sectionId
    if (sectionId === 'today' && !prev.dueOn) patch.dueOn = toISODate(startOfToday())
    if (sectionId === 'upcoming' && !prev.dueOn) patch.dueOn = toISODate(addDays(startOfToday(), 3))
    if (sectionId === 'later' && prev.dueOn) patch.dueOn = undefined
  } else {
    map[userId] = sectionId
  }
  patch.myTasksSection = map
  await updateTask(taskId, patch as Partial<Task>, actorId)
}

/** Clear personal section override (revert to date-derived bucket). */
export async function clearMyTaskSectionOverride(
  taskId: string,
  userId: string,
  actorId: string
): Promise<void> {
  const prev = useTasksStore.getState().getById(taskId) as (Task & TaskMyTasksFields) | undefined
  if (!prev?.myTasksSection?.[userId]) return
  const map = { ...prev.myTasksSection }
  delete map[userId]
  await updateTask(taskId, { myTasksSection: map } as Partial<Task>, actorId)
}

/** Add a custom personal section. */
export async function addCustomMySection(
  userId: string,
  workspaceId: string,
  name: string
): Promise<MyTasksLayout> {
  const layout = getMyTasksLayout(userId, workspaceId)
  const section = { id: newId(), name: name.trim() || 'New section' }
  const next: MyTasksLayout = {
    ...layout,
    customSections: [...layout.customSections, section],
    sectionOrder: [...layout.sectionOrder, section.id],
  }
  await saveMyTasksLayout(userId, workspaceId, next)
  return next
}

/** Reset layout to product defaults. */
export async function resetMyTasksLayout(userId: string, workspaceId: string): Promise<void> {
  await saveMyTasksLayout(userId, workspaceId, { ...DEFAULT_MY_TASKS_LAYOUT })
}
