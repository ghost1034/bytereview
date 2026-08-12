/**
 * Public form API — load and submit without authentication (backend mode).
 */
import type { Form } from '../../types'
import { TasklyticApiError, tasklyticApiFetch, tasklyticApiJson } from '../tasklyticApi'
export { usesTasklyticBackend } from '../runtimeMode'

const BASE = '/api/tasklytic/public'

/** Deliberately excludes project, assignee, section and other internal scope IDs. */
export type PublicFormDefinition = Pick<
  Form,
  | 'id'
  | 'name'
  | 'description'
  | 'fields'
  | 'isPublic'
  | 'accessMode'
  | 'publicSlug'
  | 'confirmationMessage'
  | 'branding'
  | 'copyAnswersToDescription'
  | 'createdAt'
> & { submissionToken?: string }

export async function fetchAuthenticatedForm(formKey: string): Promise<PublicFormDefinition | null> {
  try {
    return await tasklyticApiJson<PublicFormDefinition>(`/forms/${encodeURIComponent(formKey)}/definition`)
  } catch (error) {
    if (error instanceof TasklyticApiError && [401, 403, 404].includes(error.status)) return null
    throw error
  }
}

export async function fetchPublicForm(formKey: string): Promise<PublicFormDefinition | null> {
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}`)
  if (res.status === 404) return null
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.assign(`/signin?redirect=${encodeURIComponent(`/project-management/forms/${formKey}`)}`)
    return null
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Failed to load form (${res.status})`)
  }
  return res.json() as Promise<PublicFormDefinition>
}

export async function submitPublicFormApi(
  formKey: string,
  answers: Record<string, unknown>,
  submissionToken?: string,
): Promise<{ taskId: string; submissionId: string }> {
  const preparedAnswers = await uploadFormAttachments(formKey, answers, false)
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ answers: preparedAnswers, submissionToken, website: '' }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Submit failed (${res.status})`)
  }
  return res.json() as Promise<{ taskId: string; submissionId: string }>
}

export async function submitAuthenticatedFormApi(
  formKey: string,
  answers: Record<string, unknown>,
): Promise<{ taskId: string; submissionId: string }> {
  const preparedAnswers = await uploadFormAttachments(formKey, answers, true)
  return tasklyticApiJson(`/forms/${encodeURIComponent(formKey)}/submit`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ answers: preparedAnswers }),
  })
}
type PendingAttachment = {
  file?: File
  name: string
  mime: string
  size: number
}

async function uploadFormAttachments(
  formKey: string,
  answers: Record<string, unknown>,
  authenticated: boolean,
): Promise<Record<string, unknown>> {
  const output: Record<string, unknown> = { ...answers }
  for (const [fieldId, raw] of Object.entries(answers)) {
    const values = Array.isArray(raw) ? raw : [raw]
    if (!values.some((value) => value && typeof value === 'object' && (value as PendingAttachment).file instanceof File)) {
      continue
    }
    output[fieldId] = await Promise.all(values.map(async (value) => {
      const attachment = value as PendingAttachment
      if (!(attachment.file instanceof File)) return value
      const initiatePath = authenticated
        ? `/forms/${encodeURIComponent(formKey)}/files:initiate`
        : `${BASE}/forms/${encodeURIComponent(formKey)}/files:initiate`
      const initiateBody = JSON.stringify({
        filename: attachment.name,
        content_type: attachment.mime,
        size: attachment.size,
      })
      const initiate = authenticated
        ? await tasklyticApiFetch(initiatePath, { method: 'POST', body: initiateBody })
        : await fetch(initiatePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: initiateBody })
      if (!initiate.ok) {
        const body = await initiate.json().catch(() => ({}))
        throw new Error(body?.detail || `Could not initiate attachment (${initiate.status})`)
      }
      const signed = await initiate.json() as {
        object_name: string
        upload_url: string
        upload_token: string
        content_type: string
      }
      const uploaded = await fetch(signed.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': signed.content_type },
        body: attachment.file,
      })
      if (!uploaded.ok) throw new Error(`Attachment upload failed (${uploaded.status})`)
      const completed = await fetch(`${BASE}/files:complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object_name: signed.object_name, upload_token: signed.upload_token }),
      })
      if (!completed.ok) {
        const body = await completed.json().catch(() => ({}))
        throw new Error(body?.detail || `Could not complete attachment (${completed.status})`)
      }
      return {
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        uploadRef: signed.object_name,
        uploadToken: signed.upload_token,
      }
    }))
  }
  return output
}
