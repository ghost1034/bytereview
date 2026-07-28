/**
 * Format and validate form answers for display and submission.
 */
import type { Form, FormField } from '../../types'

/** Attachment payload stored in submission answers. */
export type AttachmentAnswer = {
  name: string
  mime: string
  size: number
  dataUrl: string
}

export function isAttachmentAnswer(value: unknown): value is AttachmentAnswer {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.name === 'string' && typeof v.dataUrl === 'string'
}

/** Human-readable answer text for a field value. */
export function answerText(field: FormField, value: unknown): string {
  if (value == null || value === '') return '—'
  if (field.type === 'attachment') {
    if (Array.isArray(value)) {
      return value.map((v) => (isAttachmentAnswer(v) ? v.name : String(v))).join(', ')
    }
    return isAttachmentAnswer(value) ? value.name : String(value)
  }
  if (field.type === 'dropdown') {
    const id = String(value)
    return field.options.find((o) => o.id === id)?.label ?? id
  }
  if (field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value.map(String) : []
    return ids
      .map((id) => field.options.find((o) => o.id === id)?.label ?? id)
      .join(', ') || '—'
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/** Build HTML definition list of all answers for task notes. */
export function buildAnswersDescription(form: Form, answers: Record<string, unknown>): string {
  const rows = form.fields
    .map((f) => `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(answerText(f, answers[f.id]))}</dd>`)
    .join('')
  return `<dl>${rows}</dl>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Validate required fields; returns first error message or null. */
export function validateFormAnswers(form: Form, answers: Record<string, unknown>): string | null {
  for (const field of form.fields) {
    if (!field.required) continue
    const err = validateField(field, answers[field.id])
    if (err) return err
  }
  return null
}

function validateField(field: FormField, value: unknown): string | null {
  if (field.type === 'multi_select') {
    if (!Array.isArray(value) || value.length === 0) return `${field.label} is required`
    return null
  }
  if (field.type === 'attachment') {
    if (field.required) {
      const hasFile = Array.isArray(value)
        ? value.some(isAttachmentAnswer)
        : isAttachmentAnswer(value)
      if (!hasFile) return `${field.label} is required`
    }
    return null
  }
  if (value == null || value === '') return `${field.label} is required`
  return null
}

/** Short snippet for submissions table. */
export function answerSnippet(form: Form, answers: Record<string, unknown>, maxLen = 80): string {
  const parts = form.fields.slice(0, 3).map((f) => `${f.label}: ${answerText(f, answers[f.id])}`)
  const text = parts.join(' · ')
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}
