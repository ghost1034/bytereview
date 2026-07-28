/**
 * Proposal apply registry — all AI mutations require explicit user confirmation.
 */
import { createSubtask, createTask, updateNotes, updateTask } from '../../lib/taskActions'
import { postStatusUpdate } from '../../lib/statusUpdateActions'
import { useTasksStore } from '../../stores/entities'
import type {
  AiProposal,
  CreateSubtasksPayload,
  CreateTaskPayload,
  DraftStatusUpdatePayload,
  SmartFieldsPayload,
  UpdateDescriptionPayload,
} from '../../lib/ai/types'

export type ApplyResult = { ok: true; message: string } | { ok: false; error: string }

async function applyDraftStatus(payload: DraftStatusUpdatePayload, actorId: string): Promise<ApplyResult> {
  await postStatusUpdate({
    projectId: payload.projectId,
    authorId: actorId,
    status: payload.status,
    title: payload.title,
    summaryHtml: payload.summaryHtml,
    highlightsHtml: payload.highlightsHtml,
    blockersHtml: payload.blockersHtml,
    nextStepsHtml: payload.nextStepsHtml,
  })
  return { ok: true, message: 'Status update posted.' }
}

async function applySubtasks(payload: CreateSubtasksPayload, actorId: string): Promise<ApplyResult> {
  let created = 0
  for (const name of payload.names) {
    const res = await createSubtask(payload.parentTaskId, name, actorId)
    if (res.task) created += 1
  }
  return { ok: true, message: `Created ${created} subtask${created === 1 ? '' : 's'}.` }
}

async function applyDescription(payload: UpdateDescriptionPayload, actorId: string): Promise<ApplyResult> {
  await updateNotes(payload.taskId, payload.nextNotes, actorId)
  return { ok: true, message: 'Description updated.' }
}

async function applySmartFields(payload: SmartFieldsPayload, actorId: string): Promise<ApplyResult> {
  const task = useTasksStore.getState().getById(payload.taskId)
  const patch: Parameters<typeof updateTask>[1] = {}
  if (payload.assigneeId) patch.assigneeId = payload.assigneeId
  if (payload.dueOn) patch.dueOn = payload.dueOn
  if (payload.priorityFieldId && payload.priorityOptionId) {
    patch.customFieldValues = {
      ...task?.customFieldValues,
      [payload.priorityFieldId]: { type: 'dropdown', value: payload.priorityOptionId },
    }
  }
  await updateTask(payload.taskId, patch, actorId)
  return { ok: true, message: 'Task fields updated.' }
}

async function applyCreateTask(payload: CreateTaskPayload, actorId: string): Promise<ApplyResult> {
  await createTask({
    workspaceId: payload.workspaceId,
    name: payload.name,
    projectId: payload.projectId,
    assigneeId: payload.assigneeId,
    dueOn: payload.dueOn,
    actorId,
  })
  return { ok: true, message: `Task "${payload.name}" created.` }
}

/** Execute a confirmed proposal against stores via task/status actions. */
export async function applyProposal(proposal: AiProposal, actorId: string): Promise<ApplyResult> {
  switch (proposal.type) {
    case 'draft_status_update':
      return applyDraftStatus(proposal.payload as DraftStatusUpdatePayload, actorId)
    case 'create_subtasks':
      return applySubtasks(proposal.payload as CreateSubtasksPayload, actorId)
    case 'update_description':
      return applyDescription(proposal.payload as UpdateDescriptionPayload, actorId)
    case 'smart_fields':
      return applySmartFields(proposal.payload as SmartFieldsPayload, actorId)
    case 'create_task':
      return applyCreateTask(proposal.payload as CreateTaskPayload, actorId)
    default:
      return { ok: false, error: 'Unknown proposal type.' }
  }
}
