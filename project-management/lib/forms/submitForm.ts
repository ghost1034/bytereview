/**
 * Form submission — validates answers, creates task, attachments, and notification.
 */
import { getAnalyticsAdapter } from '../analytics'
import { createNotification } from '../notifications'
import { newId } from '../ids'
import { createTask, updateTask } from '../taskActions'
import { now } from '../time'
import type { Attachment, Form } from '../../types'
import {
  useAttachmentsStore,
  useFormSubmissionsStore,
  useFormsStore,
  useProjectsStore,
  useSectionsStore,
} from '../../stores/entities'
import {
  buildAnswersDescription,
  isAttachmentAnswer,
  validateFormAnswers,
  type AttachmentAnswer,
} from './answerFormat'

export type SubmitFormResult =
  | { ok: true; taskId: string; submissionId: string }
  | { ok: false; error: string }

/** Submit a public or internal form and create a task in the linked project. */
export async function submitForm(
  formId: string,
  answers: Record<string, unknown>,
  submittedBy?: string
): Promise<SubmitFormResult> {
  const form = useFormsStore.getState().getById(formId)
  if (!form) return { ok: false, error: 'Form not found' }
  if (!form.isPublic && !submittedBy) {
    return { ok: false, error: 'Sign in required to submit this form' }
  }

  const validationError = validateFormAnswers(form, answers)
  if (validationError) return { ok: false, error: validationError }

  const project = useProjectsStore.getState().getById(form.projectId)
  if (!project) return { ok: false, error: 'Target project not found' }

  const titleFieldId = form.taskTitleFieldId ?? form.fields[0]?.id
  const titleRaw = titleFieldId ? answers[titleFieldId] : undefined
  const name = String(titleRaw ?? form.name).trim() || form.name

  const sectionId =
    form.defaultSectionId ??
    useSectionsStore.getState().list().find((s) => s.projectId === form.projectId)?.id

  const actorId = submittedBy ?? project.ownerId

  const task = await createTask({
    workspaceId: project.workspaceId,
    name,
    projectId: form.projectId,
    sectionId,
    assigneeId: form.defaultAssigneeId,
    actorId,
  })

  const notes = form.copyAnswersToDescription ? buildAnswersDescription(form, answers) : undefined
  const attachmentIds = await createAttachmentRecords(form, answers, task.id, actorId)

  if (notes || attachmentIds.length) {
    await updateTask(
      task.id,
      {
        ...(notes ? { notes } : {}),
        ...(attachmentIds.length ? { attachmentIds: [...task.attachmentIds, ...attachmentIds] } : {}),
      },
      actorId
    )
  }

  const submission = {
    id: newId(),
    formId: form.id,
    answers,
    submittedBy,
    taskId: task.id,
    createdAt: now(),
  }
  await useFormSubmissionsStore.getState().add(submission)

  if (form.defaultAssigneeId) {
    await createNotification({
      userId: form.defaultAssigneeId,
      actorId,
      type: 'form_submission',
      scope: { type: 'form', id: form.id },
      message: `New submission on "${form.name}" created task "${name}"`,
      metadata: { taskId: task.id, formId: form.id, submissionId: submission.id },
    })
  }

  getAnalyticsAdapter().track('form_submitted', {
    formId: form.id,
    projectId: form.projectId,
    taskId: task.id,
  })

  return { ok: true, taskId: task.id, submissionId: submission.id }
}

async function createAttachmentRecords(
  form: Form,
  answers: Record<string, unknown>,
  taskId: string,
  uploadedBy: string
): Promise<string[]> {
  const attachmentFields = form.fields.filter((f) => f.type === 'attachment')
  if (!attachmentFields.length) return []

  const ids: string[] = []
  const addAttachment = useAttachmentsStore.getState().add

  for (const field of attachmentFields) {
    const files = normalizeAttachments(answers[field.id])
    for (const file of files) {
      const att: Attachment = {
        id: newId(),
        name: file.name,
        size: file.size,
        mime: file.mime,
        dataUrl: file.dataUrl,
        storage: 'local',
        uploadedBy,
        taskId,
        createdAt: now(),
      }
      await addAttachment(att)
      ids.push(att.id)
    }
  }

  return ids
}

function normalizeAttachments(value: unknown): AttachmentAnswer[] {
  if (!value) return []
  if (isAttachmentAnswer(value)) return [value]
  if (Array.isArray(value)) return value.filter(isAttachmentAnswer)
  return []
}

export { publicFormUrl } from './publicFormUrl'
