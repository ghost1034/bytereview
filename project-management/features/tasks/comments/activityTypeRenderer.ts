/**
 * Human-readable activity sentences per ActivityEvent type.
 */
import { formatDate } from '../../../lib/time'
import type { ActivityEvent, User } from '../../../types'
import { useProjectsStore, useTasksStore, useUsersStore } from '../../../stores/entities'

function userName(id: string | undefined): string {
  if (!id) return 'someone'
  return useUsersStore.getState().getById(id)?.name ?? 'someone'
}

function projectName(id: string | undefined): string {
  if (!id) return 'a project'
  return useProjectsStore.getState().getById(id)?.name ?? 'a project'
}

function formatDue(details: Record<string, unknown>): string {
  const due = (details.dueOn as string | undefined) ?? (details.dueAt as string | undefined)
  return due ? formatDate(due) : 'updated'
}

/** Render a typed activity sentence (without actor name). */
export function renderActivitySentence(event: ActivityEvent): string {
  const d = event.details

  switch (event.type) {
    case 'task_created':
      return `created this task`
    case 'task_completed':
      return `marked this complete`
    case 'task_assigned':
      return `assigned to ${userName(d.assigneeId as string | undefined)}`
    case 'task_unassigned':
      return `removed the assignee`
    case 'due_date_changed':
      return `changed the due date to ${formatDue(d)}`
    case 'project_added':
      return `added this task to ${projectName((d.projectId as string) ?? event.projectId)}`
    case 'project_removed':
      return `removed this task from ${projectName((d.projectId as string) ?? event.projectId)}`
    case 'subtask_added':
      return `added subtask "${(d.name as string) ?? 'Untitled'}"`
    case 'dependency_added': {
      const blocker = useTasksStore.getState().getById(d.blockedById as string)
      return blocker ? `added dependency on "${blocker.name}"` : `added a dependency`
    }
    case 'comment_added':
      return `commented on this task`
    case 'custom_field_changed':
      return `changed ${(d.fieldName as string) ?? 'a custom field'}`
    case 'attachment_added':
      return `added attachment "${(d.name as string) ?? 'file'}"`
    case 'status_update_posted': {
      const action = d.action as string | undefined
      if (action === 'archived') return `archived the project`
      if (action === 'deleted') return `deleted the project`
      if (action === 'renamed') return `renamed the project to "${(d.name as string) ?? ''}"`
      if (action === 'status_changed') return `changed project status to ${(d.status as string) ?? 'updated'}`
      return `posted a status update`
    }
    case 'rule_action':
      return `ran automation (${(d.action as string) ?? 'action'})`
    default:
      return String(event.type).replace(/_/g, ' ')
  }
}

/** Resolve actor for an activity row. */
export function getActivityActor(actorId: string): User | undefined {
  return useUsersStore.getState().getById(actorId)
}

/** Group key (YYYY-MM-DD) for day headers. */
export function activityDayKey(iso: string): string {
  return iso.slice(0, 10)
}

export function formatActivityDayLabel(dayKey: string): string {
  return formatDate(dayKey)
}

/** Category for filter chips. */
export function activityFilterCategory(type: ActivityEvent['type']): string {
  if (type === 'comment_added') return 'comments'
  if (type === 'subtask_added') return 'subtasks'
  if (type === 'custom_field_changed') return 'custom_fields'
  if (type === 'rule_action') return 'approvals'
  return 'updates'
}
