'use client'

import { getCurrentAuthToken } from '@/lib/firebase'
import type { PbcContact, PbcDashboard, PbcDocument, PbcEngagement, PbcRequestItem } from './types'

async function firmRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getCurrentAuthToken()
  const response = await fetch(`/api/pbc${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = body.detail
    throw new Error(typeof detail === 'string' ? detail : detail?.message || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const pbcApi = {
  dashboard: () => firmRequest<PbcDashboard>('/dashboard'),
  projectLinks: () => firmRequest<{ projects: Array<{ workspace_id: string; project_id: string; name: string }> }>('/project-links'),
  engagements: () => firmRequest<{ engagements: PbcEngagement[] }>('/engagements'),
  engagement: (id: string) => firmRequest<PbcEngagement>(`/engagements/${id}`),
  createEngagement: (payload: Record<string, unknown>) => firmRequest<PbcEngagement>('/engagements', { method: 'POST', body: JSON.stringify(payload) }),
  updateEngagement: (id: string, payload: Record<string, unknown>) => firmRequest<PbcEngagement>(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  publish: (id: string) => firmRequest<PbcEngagement>(`/engagements/${id}/publish`, { method: 'POST' }),
  engagementAction: (id: string, action: 'complete' | 'archive') => firmRequest<PbcEngagement>(`/engagements/${id}/actions/${action}`, { method: 'POST' }),
  createRequest: (engagementId: string, payload: Record<string, unknown>) => firmRequest<PbcRequestItem>(`/engagements/${engagementId}/requests`, { method: 'POST', body: JSON.stringify(payload) }),
  updateRequest: (id: string, payload: Record<string, unknown>) => firmRequest<PbcRequestItem>(`/requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteRequest: (id: string) => firmRequest<void>(`/requests/${id}`, { method: 'DELETE' }),
  transition: (id: string, action: string, revision: number, reason?: string) => firmRequest<PbcRequestItem>(`/requests/${id}/transition`, { method: 'POST', body: JSON.stringify({ action, expected_revision: revision, reason }) }),
  comment: (id: string, body: string, visibility: 'client' | 'internal') => firmRequest(`/requests/${id}/comments`, { method: 'POST', body: JSON.stringify({ body, visibility }) }),
  contacts: (clientId?: string) => firmRequest<{ contacts: PbcContact[] }>(`/contacts${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`),
  createContact: (payload: Record<string, unknown>) => firmRequest<PbcContact>('/contacts', { method: 'POST', body: JSON.stringify(payload) }),
  assignContact: (engagementId: string, contactId: string, payload: Record<string, unknown>) => firmRequest<PbcEngagement>(`/engagements/${engagementId}/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify({ contact_id: contactId, ...payload }) }),
  accessLink: (engagementId: string, payload: Record<string, unknown>) => firmRequest<{ url: string; email_delivered?: boolean }>(`/engagements/${engagementId}/access-links`, { method: 'POST', body: JSON.stringify(payload) }),
  templates: () => firmRequest<{ templates: Array<Record<string, unknown>> }>('/templates'),
  createTemplate: (payload: Record<string, unknown>) => firmRequest('/templates', { method: 'POST', body: JSON.stringify(payload) }),
  settings: () => firmRequest<{ timezone: string; portal_name?: string | null; logo_url?: string | null; reminder_days_before: number; overdue_interval_days: number }>('/settings'),
  updateSettings: (payload: Record<string, unknown>) => firmRequest('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  aiDraft: (engagementId: string, instructions?: string) => firmRequest<{ summary: string; proposals: Array<Record<string, unknown>> }>(`/engagements/${engagementId}/ai/draft`, { method: 'POST', body: JSON.stringify({ instructions }) }),
  completeness: (engagementId: string) => firmRequest<{ flags: Array<{ request_id: string; request_number: string; warnings: string[] }> }>(`/engagements/${engagementId}/ai/completeness`),
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return firmRequest<{ rows: Array<Record<string, unknown>>; row_count: number }>('/imports/preview', { method: 'POST', body: form })
  },
  importCommit: (engagementId: string, rows: Array<Record<string, unknown>>) => firmRequest(`/engagements/${engagementId}/imports`, { method: 'POST', body: JSON.stringify({ rows }) }),
  upload: async (requestId: string, file: File) => {
    const initiated = await firmRequest<{ document: PbcDocument; upload_url: string; content_type: string }>(`/requests/${requestId}/files:initiate`, {
      method: 'POST', body: JSON.stringify({ filename: file.name, content_type: file.type || 'application/octet-stream', size: file.size }),
    })
    const put = await fetch(initiated.upload_url, { method: 'PUT', headers: { 'Content-Type': initiated.content_type }, body: file })
    if (!put.ok) throw new Error('The secure file upload failed')
    return firmRequest<{ document: PbcDocument }>('/files:complete', { method: 'POST', body: JSON.stringify({ document_id: initiated.document.id }) })
  },
  download: async (documentId: string) => {
    const result = await firmRequest<{ url: string }>(`/documents/${documentId}/download-url`)
    window.location.assign(result.url)
  },
  downloadArtifact: async (engagementId: string, kind: 'export.xlsx' | 'package.zip', filename: string) => {
    const token = await getCurrentAuthToken()
    const response = await fetch(`/api/pbc/engagements/${engagementId}/${kind}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error('The PBC export could not be generated')
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  },
}

export async function portalRequest<T>(path: string, options: RequestInit = {}, csrf?: string | null): Promise<T> {
  const response = await fetch(`/api/pbc/portal${path}`, {
    ...options,
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-PBC-CSRF': csrf } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}
