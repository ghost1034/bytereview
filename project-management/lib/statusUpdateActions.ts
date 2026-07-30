/**
 * Status update mutations — persist update, sync project pill, activity, notifications.
 */
import { emitActivity } from './activity'
import { newId } from './ids'
import { now } from './time'
import { notifyStatusUpdate } from './notifications'
import { updateProjectStatus } from './projectActions'
import { STATUS_LABELS } from '../features/projects/projectUtils'
import type { ProjectStatus, StatusUpdate } from '../types'
import { useProjectsStore, useStatusUpdatesStore } from '../stores/entities'

export type PostStatusUpdateInput = {
  projectId: string
  authorId: string
  status: Exclude<ProjectStatus, null>
  title: string
  summaryHtml: string
  highlightsHtml?: string
  blockersHtml?: string
  nextStepsHtml?: string
}

/** Create a status update, update the project pill, emit activity, and notify members. */
export async function postStatusUpdate(input: PostStatusUpdateInput): Promise<StatusUpdate> {
  const update: StatusUpdate = {
    id: newId(),
    scope: { type: 'project', id: input.projectId },
    authorId: input.authorId,
    status: input.status,
    title: input.title.trim(),
    summaryHtml: input.summaryHtml,
    highlightsHtml: input.highlightsHtml,
    blockersHtml: input.blockersHtml,
    nextStepsHtml: input.nextStepsHtml,
    createdAt: now(),
  }

  await useStatusUpdatesStore.getState().add(update)
  await updateProjectStatus(input.projectId, input.status, input.authorId)
  emitActivity({
    projectId: input.projectId,
    actorId: input.authorId,
    type: 'status_update_posted',
    details: { title: update.title, updateId: update.id, status: input.status },
  })

  const project = useProjectsStore.getState().getById(input.projectId)
  const statusLabel = STATUS_LABELS[input.status]
  await Promise.all(
    (project?.memberIds ?? [])
      .filter((id) => id !== input.authorId)
      .map((userId) =>
        notifyStatusUpdate(userId, input.authorId, input.projectId, statusLabel, update.id)
      )
  )

  return update
}
