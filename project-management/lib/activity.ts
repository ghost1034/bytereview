/**
 * Activity emission helper — pushes events to the activity store.
 */
import type { ActivityEvent } from '../types'
import { newId } from './ids'
import { now } from './time'
import { useActivityStore } from '../stores/entities'

type ActivityWriter = {
  add: (event: ActivityEvent) => void
}

let writer: ActivityWriter | null = null

/** Register the activity store writer (called during hydrate). */
export function registerActivityWriter(w: ActivityWriter): void {
  writer = w
}

/** Emit and persist an activity event. */
export function emitActivity(
  partial: Omit<ActivityEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): ActivityEvent {
  const event: ActivityEvent = {
    id: partial.id ?? newId(),
    createdAt: partial.createdAt ?? now(),
    taskId: partial.taskId,
    projectId: partial.projectId,
    actorId: partial.actorId,
    type: partial.type,
    details: partial.details,
  }
  writer?.add(event)
  return event
}

export type ActivityFilter =
  | 'all'
  | 'updates'
  | 'comments'
  | 'subtasks'
  | 'custom_fields'
  | 'approvals'

const FILTER_TYPES: Record<Exclude<ActivityFilter, 'all'>, ActivityEvent['type'][]> = {
  updates: [
    'task_created',
    'task_completed',
    'task_assigned',
    'task_unassigned',
    'due_date_changed',
    'project_added',
    'project_removed',
    'dependency_added',
    'attachment_added',
    'status_update_posted',
  ],
  comments: ['comment_added'],
  subtasks: ['subtask_added'],
  custom_fields: ['custom_field_changed'],
  approvals: ['rule_action'],
}

/** Chronological activity for a task (newest first). */
export function listTaskActivity(taskId: string): ActivityEvent[] {
  return useActivityStore
    .getState()
    .list()
    .filter((a) => a.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Count activity rows for a task. */
export function getTaskActivityCount(taskId: string): number {
  return listTaskActivity(taskId).length
}

/** Apply an activity filter chip selection. */
export function filterTaskActivity(events: ActivityEvent[], filter: ActivityFilter): ActivityEvent[] {
  if (filter === 'all') return events
  const allowed = FILTER_TYPES[filter]
  return events.filter((e) => allowed.includes(e.type))
}
