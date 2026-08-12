/**

 * Task mutations — create, update, complete, assign, projects, tags; emits activity events.

 */

import { getAnalyticsAdapter } from './analytics'

import { emitActivity } from './activity'

import { newId } from './ids'

import { canReparent as validateReparent } from './subtasks'

import { notifyTaskAssigned } from './notifications'

import { now } from './time'

import type { ApprovalStatus, Task, TaskSubtype } from '../types'

import { useTasksStore } from '../stores/entities'

import { pushTaskUndo } from '../stores/taskUndo'



export const MAX_SUBTASK_DEPTH = 5



export type CreateTaskInput = {

  workspaceId: string

  name: string

  projectId?: string

  sectionId?: string

  assigneeId?: string

  dueOn?: string

  actorId: string

}



/** Depth from root (root task = 1). */

export function getTaskDepth(taskId: string, tasks?: Task[]): number {

  const all = tasks ?? useTasksStore.getState().list()

  const byId = new Map(all.map((t) => [t.id, t]))

  let depth = 1

  let current = byId.get(taskId)

  while (current?.parentId) {

    depth += 1

    current = byId.get(current.parentId)

  }

  return depth

}



/** Whether a new subtask can be created under parentId (max 5 levels). */

export function canAddSubtask(parentId: string): boolean {

  return getTaskDepth(parentId) < MAX_SUBTASK_DEPTH

}



function baseTaskFields(parent: Task): Pick<

  Task,

  | 'workspaceId'

  | 'assigneeId'

  | 'projectIds'

  | 'sectionIdByProject'

  | 'tagIds'

  | 'customFieldValues'

  | 'dependencyIds'

  | 'dependentIds'

  | 'attachmentIds'

  | 'likedByIds'

> {

  return {

    workspaceId: parent.workspaceId,

    assigneeId: parent.assigneeId,

    projectIds: [...parent.projectIds],

    sectionIdByProject: { ...parent.sectionIdByProject },

    tagIds: [],

    customFieldValues: {},

    dependencyIds: [],

    dependentIds: [],

    attachmentIds: [],

    likedByIds: [],

  }

}



function emitProjectChanges(

  taskId: string,

  actorId: string,

  prevIds: string[],

  nextIds: string[]

): void {

  const prev = new Set(prevIds)

  const next = new Set(nextIds)

  nextIds.filter((id) => !prev.has(id)).forEach((projectId) => {

    emitActivity({ taskId, projectId, actorId, type: 'project_added', details: { projectId } })

  })

  prevIds.filter((id) => !next.has(id)).forEach((projectId) => {

    emitActivity({ taskId, projectId, actorId, type: 'project_removed', details: { projectId } })

  })

}



/** Create a subtask under parentId; enforces max depth of 5. */

export async function createSubtask(

  parentId: string,

  name: string,

  actorId: string

): Promise<{ task?: Task; error?: string }> {

  const parent = useTasksStore.getState().getById(parentId)

  if (!parent) return { error: 'Parent task not found' }

  if (!canAddSubtask(parentId)) {

    return { error: `Subtasks cannot exceed ${MAX_SUBTASK_DEPTH} levels deep` }

  }

  if (!name.trim()) return { error: 'Name is required' }



  const subtask: Task = {

    id: newId(),

    name: name.trim(),

    parentId,

    resourceSubtype: 'default_task',

    completed: false,

    collaboratorIds: [],

    ...baseTaskFields(parent),

    createdAt: now(),

    modifiedAt: now(),

  }



  await useTasksStore.getState().add(subtask)

  emitActivity({

    taskId: parentId,

    actorId,

    type: 'subtask_added',

    details: { subtaskId: subtask.id, name: subtask.name },

  })

  return { task: subtask }

}



/** Create a new task and optionally attach to a project section. */

export async function createTask(input: CreateTaskInput): Promise<Task> {

  const task: Task = {

    id: newId(),

    workspaceId: input.workspaceId,

    name: input.name,

    resourceSubtype: 'default_task',

    completed: false,

    assigneeId: input.assigneeId,

    collaboratorIds: [],

    projectIds: input.projectId ? [input.projectId] : [],

    sectionIdByProject: input.projectId && input.sectionId

      ? { [input.projectId]: input.sectionId }

      : {},

    tagIds: [],

    customFieldValues: {},

    dependencyIds: [],

    dependentIds: [],

    attachmentIds: [],

    likedByIds: [],

    dueOn: input.dueOn,

    createdAt: now(),

    modifiedAt: now(),

  }



  await useTasksStore.getState().add(task)

  emitActivity({

    taskId: task.id,

    projectId: input.projectId,

    actorId: input.actorId,

    type: 'task_created',

    details: { name: task.name },

  })

  getAnalyticsAdapter().track('task_created', {

    taskId: task.id,

    projectId: input.projectId,

    workspaceId: input.workspaceId,

  })

  return task

}



/** Patch task fields and emit relevant activity. */

export async function updateTask(

  taskId: string,

  patch: Partial<Task>,

  actorId: string

): Promise<void> {

  const prev = useTasksStore.getState().getById(taskId)

  if (!prev) return



  await useTasksStore.getState().update(taskId, { ...patch, modifiedAt: now() })



  if (patch.completed === true && !prev.completed) {

    emitActivity({

      taskId,

      actorId,

      type: 'task_completed',

      details: { completedById: patch.completedById ?? actorId },

    })

    getAnalyticsAdapter().track('task_completed', { taskId })

  }

  if (patch.completed === false && prev.completed) {

    getAnalyticsAdapter().track('task_updated', { taskId, fields: ['completed'] })

  }

  if (patch.assigneeId !== undefined && patch.assigneeId !== prev.assigneeId) {

    emitActivity({

      taskId,

      actorId,

      type: patch.assigneeId ? 'task_assigned' : 'task_unassigned',

      details: { assigneeId: patch.assigneeId },

    })

    getAnalyticsAdapter().track('task_assigned', { taskId, assigneeId: patch.assigneeId })

    if (patch.assigneeId) {
      await notifyTaskAssigned(taskId, patch.assigneeId, actorId)
    }

  }

  const dueChanged =

    (patch.dueOn !== undefined && patch.dueOn !== prev.dueOn) ||

    (patch.startOn !== undefined && patch.startOn !== prev.startOn) ||

    (patch.dueAt !== undefined && patch.dueAt !== prev.dueAt)

  if (dueChanged) {

    emitActivity({

      taskId,

      actorId,

      type: 'due_date_changed',

      details: { startOn: patch.startOn, dueOn: patch.dueOn, dueAt: patch.dueAt },

    })

    getAnalyticsAdapter().track('due_date_changed', { taskId, dueOn: patch.dueOn })

  }

  if (patch.projectIds) {

    emitProjectChanges(taskId, actorId, prev.projectIds, patch.projectIds)

  }



  const skipKeys = new Set(['modifiedAt', 'completed', 'assigneeId', 'dueOn', 'startOn', 'dueAt', 'projectIds'])

  const trackedKeys = Object.keys(patch).filter((k) => !skipKeys.has(k))

  if (trackedKeys.length > 0) {

    getAnalyticsAdapter().track('task_updated', { taskId, fields: trackedKeys })

  }



}



type TaskMutationUndoOptions = {
  skipUndo?: boolean
}

/** Toggle task completion; approval subtype uses setApprovalStatus instead. */

export async function toggleComplete(
  taskId: string,
  actorId: string,
  options?: TaskMutationUndoOptions
): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task || task.resourceSubtype === 'approval') return

  const before = {
    completed: task.completed,
    completedAt: task.completedAt,
    completedById: task.completedById,
  }
  const completed = !task.completed

  await updateTask(

    taskId,

    {

      completed,

      completedAt: completed ? now() : undefined,

      completedById: completed ? actorId : undefined,

    },

    actorId

  )

  if (!options?.skipUndo) {
    const verb = completed ? 'Marked complete' : 'Marked incomplete'
    pushTaskUndo(
      {
        label: `${verb}: ${task.name}`,
        revert: () => updateTask(taskId, before, actorId),
      },
      completed
        ? {
            title: 'Task marked complete',
            description: 'Use Show completed in the toolbar if the row is hidden.',
          }
        : { title: 'Task marked incomplete' }
    )
  }

}



/** Assign or unassign a task. */

export async function assign(

  taskId: string,

  assigneeId: string | undefined,

  actorId: string

): Promise<void> {

  await updateTask(taskId, { assigneeId }, actorId)

}



/** Set start, due, and optional due time. Pass null to clear a field. */

export async function setDue(

  taskId: string,

  due: { startOn?: string | null; dueOn?: string | null; dueAt?: string | null },

  actorId: string

): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task) return

  const patch: Partial<Task> = {}

  if (due.startOn !== undefined) patch.startOn = due.startOn ?? undefined

  if (due.dueOn !== undefined) patch.dueOn = due.dueOn ?? undefined

  if (due.dueAt !== undefined) patch.dueAt = due.dueAt ?? undefined

  if (task.resourceSubtype === 'milestone' && patch.startOn) {

    patch.startOn = undefined

  }

  await updateTask(taskId, patch, actorId)

}



/** Add task to a project with optional section. */

export async function addToProject(

  taskId: string,

  projectId: string,

  sectionId: string | undefined,

  actorId: string

): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task || task.projectIds.includes(projectId)) return

  const sectionIdByProject = { ...task.sectionIdByProject, [projectId]: sectionId }

  await updateTask(

    taskId,

    { projectIds: [...task.projectIds, projectId], sectionIdByProject },

    actorId

  )

}



/** Remove task from a project (does not delete the task). */

export async function removeFromProject(

  taskId: string,

  projectId: string,

  actorId: string

): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task) return

  const sectionIdByProject = { ...task.sectionIdByProject }

  delete sectionIdByProject[projectId]

  await updateTask(

    taskId,

    { projectIds: task.projectIds.filter((id) => id !== projectId), sectionIdByProject },

    actorId

  )

}



/** Update section assignment within a project. */

export async function setSectionForProject(

  taskId: string,

  projectId: string,

  sectionId: string,

  actorId: string

): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task || !task.projectIds.includes(projectId)) return

  await updateTask(

    taskId,

    { sectionIdByProject: { ...task.sectionIdByProject, [projectId]: sectionId } },

    actorId

  )

}



/** Change task subtype; milestones clear startOn. */

export async function setSubtype(

  taskId: string,

  subtype: TaskSubtype,

  actorId: string

): Promise<void> {

  const patch: Partial<Task> = { resourceSubtype: subtype }

  if (subtype === 'milestone') {

    patch.startOn = undefined

  }

  if (subtype !== 'approval') {

    patch.approvalStatus = undefined

  } else {

    patch.approvalStatus = 'pending'

    patch.completed = false

    patch.completedAt = undefined

    patch.completedById = undefined

  }

  await updateTask(taskId, patch, actorId)

}



/** Set approval status and sync completed state. */

export async function setApprovalStatus(

  taskId: string,

  status: ApprovalStatus,

  actorId: string

): Promise<void> {

  const completed = status === 'approved'

  await updateTask(

    taskId,

    {

      approvalStatus: status,

      completed,

      completedAt: completed ? now() : undefined,

      completedById: completed ? actorId : undefined,

    },

    actorId

  )

}



/** Toggle current user's like on a task. */

export async function toggleLike(taskId: string, userId: string): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task) return

  const liked = task.likedByIds.includes(userId)

  const likedByIds = liked

    ? task.likedByIds.filter((id) => id !== userId)

    : [...task.likedByIds, userId]

  await useTasksStore.getState().update(taskId, { likedByIds, modifiedAt: now() })

}



/** Add a follower (collaborator). */

export async function addFollower(taskId: string, userId: string, actorId: string): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task || task.collaboratorIds.includes(userId)) return

  await updateTask(taskId, { collaboratorIds: [...task.collaboratorIds, userId] }, actorId)

}



/** Remove a follower. */

export async function removeFollower(taskId: string, userId: string, actorId: string): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task) return

  await updateTask(

    taskId,

    { collaboratorIds: task.collaboratorIds.filter((id) => id !== userId) },

    actorId

  )

}



/** Add a tag to a task. */

export async function addTagToTask(taskId: string, tagId: string, actorId: string): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task || task.tagIds.includes(tagId)) return

  await updateTask(taskId, { tagIds: [...task.tagIds, tagId] }, actorId)

}



/** Remove a tag from a task. */

export async function removeTagFromTask(taskId: string, tagId: string, actorId: string): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)

  if (!task) return

  await updateTask(taskId, { tagIds: task.tagIds.filter((id) => id !== tagId) }, actorId)

}



/** Rename task; reverts if name is empty. */

export async function renameTask(taskId: string, name: string, actorId: string): Promise<boolean> {

  const trimmed = name.trim()

  if (!trimmed) return false

  await updateTask(taskId, { name: trimmed }, actorId)

  return true

}



/** Update task description HTML. */

export async function updateNotes(taskId: string, notes: string, actorId: string): Promise<void> {

  await updateTask(taskId, { notes }, actorId)

}



/** Duplicate a task (shallow copy, no subtasks). */

export async function duplicateTask(taskId: string, actorId: string): Promise<Task | undefined> {

  const source = useTasksStore.getState().getById(taskId)

  if (!source) return undefined

  const copy: Task = {

    ...source,

    id: newId(),

    name: `${source.name} (copy)`,

    completed: false,

    completedAt: undefined,

    completedById: undefined,

    parentId: undefined,

    likedByIds: [],

    createdAt: now(),

    modifiedAt: now(),

  }

  await useTasksStore.getState().add(copy)

  emitActivity({

    taskId: copy.id,

    actorId,

    type: 'task_created',

    details: { name: copy.name, duplicatedFrom: taskId },

  })

  return copy

}



/** Delete a task permanently. */

export async function deleteTask(
  taskId: string,
  actorId?: string,
  options?: TaskMutationUndoOptions
): Promise<void> {

  const task = useTasksStore.getState().getById(taskId)
  if (!task) return

  const snapshot = { ...task }

  await useTasksStore.getState().remove(taskId)

  getAnalyticsAdapter().track('task_deleted', { taskId, actorId })

  if (!options?.skipUndo) {
    pushTaskUndo(
      {
        label: `Deleted: ${task.name}`,
        revert: async () => {
          await useTasksStore.getState().add(snapshot)
        },
      },
      {
        title: 'Task deleted',
        description: 'Use Undo in the toolbar to restore this task (up to 10 recent actions).',
      }
    )
  }

}


/** Reparent a task; pass null to detach from parent (top-level). */

export async function reparentTask(

  taskId: string,

  newParentId: string | null,

  actorId: string

): Promise<{ error?: string }> {

  const allTasks = useTasksStore.getState().list()

  const check = validateReparent(taskId, newParentId, allTasks)

  if (!check.ok) return { error: check.error }

  await updateTask(

    taskId,

    { parentId: newParentId ?? undefined },

    actorId

  )

  return {}

}



/** Detach a subtask from its parent (promote to top-level task). */

export async function promoteSubtaskToTask(

  taskId: string,

  actorId: string

): Promise<{ error?: string }> {

  return reparentTask(taskId, null, actorId)

}


