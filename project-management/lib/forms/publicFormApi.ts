/**
 * Public form API — load and submit without authentication (backend mode).
 */
import type { Form } from '../../types'

const BASE = '/api/tasklytic/public'

/** Deliberately excludes project, assignee, section and other internal scope IDs. */
export type PublicFormDefinition = Pick<
  Form,
  | 'id'
  | 'name'
  | 'description'
  | 'fields'
  | 'isPublic'
  | 'publicSlug'
  | 'confirmationMessage'
  | 'branding'
  | 'copyAnswersToDescription'
  | 'createdAt'
>

export async function fetchPublicForm(formKey: string): Promise<PublicFormDefinition | null> {
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}`)
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Failed to load form (${res.status})`)
  }
  return res.json() as Promise<PublicFormDefinition>
}

export async function submitPublicFormApi(
  formKey: string,
  answers: Record<string, unknown>,
): Promise<{ taskId: string; submissionId: string }> {
  const preparedAnswers = await uploadPublicAttachments(formKey, answers)
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ answers: preparedAnswers }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Submit failed (${res.status})`)
  }
  return res.json() as Promise<{ taskId: string; submissionId: string }>
}

type PendingAttachment = {
  file?: File
  name: string
  mime: string
  size: number
}

async function uploadPublicAttachments(
  formKey: string,
  answers: Record<string, unknown>,
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
      const initiate = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}/files:initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: attachment.name,
          content_type: attachment.mime,
          size: attachment.size,
        }),
      })
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

export function usesTasklyticBackend(): boolean {
  return process.env.NEXT_PUBLIC_TASKLYTIC_BACKEND === '1'
}
