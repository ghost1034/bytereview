/**
 * Public form API — load and submit without authentication (backend mode).
 */
import type { Form } from '../../types'

const BASE = '/api/tasklytic/public'

export async function fetchPublicForm(formKey: string): Promise<Form | null> {
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}`)
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Failed to load form (${res.status})`)
  }
  return res.json() as Promise<Form>
}

export async function submitPublicFormApi(
  formKey: string,
  answers: Record<string, unknown>,
): Promise<{ taskId: string; submissionId: string }> {
  const res = await fetch(`${BASE}/forms/${encodeURIComponent(formKey)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Submit failed (${res.status})`)
  }
  return res.json() as Promise<{ taskId: string; submissionId: string }>
}

export function usesTasklyticBackend(): boolean {
  return process.env.NEXT_PUBLIC_TASKLYTIC_BACKEND === '1'
}
