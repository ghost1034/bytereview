/**
 * Shared task instantiation helpers for templates and bundles.
 */
import { newId } from '../ids'
import { now } from '../time'
import type { Task, TaskTemplate } from '../../types'
import { useTagsStore, useTasksStore } from '../../stores/entities'

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function resolveRelativeDate(value: unknown, projectStart: string): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.startsWith('+')) {
    const offset = parseInt(value.slice(1), 10)
    if (!Number.isNaN(offset)) return addDays(projectStart, offset)
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

async function ensureRoleTag(workspaceId: string, role: string): Promise<string> {
  const existing = useTagsStore.getState().list().find((t) => t.workspaceId === workspaceId && t.name === role)
  if (existing) return existing.id
  const tag = { id: newId(), workspaceId, name: role, color: 'gray' }
  await useTagsStore.getState().add(tag)
  return tag.id
}

function extractRole(notes?: string): string | undefined {
  const m = notes?.match(/Role:\s*(.+)/i)
  return m?.[1]?.trim()
}

export async function createTaskFromTaskTemplate(
  tpl: TaskTemplate,
  ctx: {
    workspaceId: string
    projectId: string
    sectionId?: string
    ownerId: string
    projectStart: string
    parentId?: string
    taskOrder: string[]
    roleAssignments?: Record<string, string>
  }
): Promise<Task> {
  const taskId = newId()
  ctx.taskOrder.push(taskId)
  const role = extractRole(tpl.defaults.notes)
  const resolvedRoleUserId = role ? ctx.roleAssignments?.[role] : undefined
  const tagIds: string[] = role && !resolvedRoleUserId ? [await ensureRoleTag(ctx.workspaceId, role)] : []
  const task: Task = {
    id: taskId,
    workspaceId: ctx.workspaceId,
    name: tpl.name,
    notes: tpl.defaults.notes,
    resourceSubtype: tpl.defaults.resourceSubtype ?? 'default_task',
    completed: false,
    assigneeId: role ? resolvedRoleUserId : tpl.defaults.assigneeId ?? ctx.ownerId,
    collaboratorIds: tpl.defaults.collaboratorIds ?? [],
    startOn: resolveRelativeDate(tpl.defaults.startOn, ctx.projectStart),
    dueOn: resolveRelativeDate(tpl.defaults.dueOn, ctx.projectStart),
    parentId: ctx.parentId,
    projectIds: [ctx.projectId],
    sectionIdByProject: ctx.sectionId ? { [ctx.projectId]: ctx.sectionId } : {},
    tagIds,
    customFieldValues: tpl.defaults.customFieldValues ?? {},
    dependencyIds: [],
    dependentIds: [],
    attachmentIds: [],
    likedByIds: [],
    createdAt: now(),
    modifiedAt: now(),
  }
  await useTasksStore.getState().add(task)
  for (const sub of tpl.subtaskTemplates) {
    await createTaskFromTaskTemplate(sub, { ...ctx, parentId: taskId, taskOrder: [] })
  }
  return task
}

export async function instantiateTemplateTasksFromTemplates(
  templates: TaskTemplate[],
  ctx: {
    workspaceId: string
    projectId: string
    sectionId?: string
    ownerId: string
    projectStart: string
  }
): Promise<void> {
  const order: string[] = []
  for (const tpl of templates) {
    await createTaskFromTaskTemplate(tpl, { ...ctx, taskOrder: order })
  }
}
