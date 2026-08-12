import { tasklyticApiJson } from '../tasklyticApi'
import type { AiThread } from './settingsStore'
import type { AiContextScope, AiProposal, GeminiModelId, VertexModelOption } from './types'

export type ServerAiSettings = {
  workspaceId: string
  enabled: boolean
  paused: boolean
  model: GeminiModelId
  models: VertexModelOption[]
  localThreadsMigrated: boolean
  migratedAt?: string | null
}

export type AiTeammateJob = {
  id: string
  workspaceId: string
  teammate: 'tria' | 'summarie' | 'statura'
  enabled: boolean
  scope: { type: 'workspace' | 'project' | 'task'; id: string }
  cadence: 'event' | 'daily' | 'weekly'
  timezone: string
  nextRunAt: string
  dailyLimit: number
  runsToday: number
  config: Record<string, unknown>
  lastRunAt?: string | null
}

export async function loadAiSettings(workspaceId: string) {
  return tasklyticApiJson<ServerAiSettings>(`/ai/settings?workspace_id=${encodeURIComponent(workspaceId)}`)
}

export async function saveAiSettings(workspaceId: string, patch: Partial<ServerAiSettings>) {
  return tasklyticApiJson<ServerAiSettings>('/ai/settings', {
    method: 'PUT', body: JSON.stringify({ workspaceId, ...patch }),
  })
}

export async function loadAiThreads(workspaceId: string) {
  return tasklyticApiJson<{ threads: AiThread[] }>(`/ai/threads?workspace_id=${encodeURIComponent(workspaceId)}`)
}

export async function createServerThread(workspaceId: string, contextScope?: AiContextScope) {
  return tasklyticApiJson<AiThread>('/ai/threads', {
    method: 'POST', body: JSON.stringify({ workspaceId, title: 'New chat', contextScope }),
  })
}

export async function migrateAiThreads(workspaceId: string, userId: string, threads: AiThread[]) {
  return tasklyticApiJson<{ migrated: boolean; threads: AiThread[] }>('/ai/threads:migrate', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, migrationId: `tasklytic-ai-v1:${workspaceId}:${userId}`, threads }),
  })
}

export async function editServerProposal(id: string, payload: Record<string, unknown>) {
  return tasklyticApiJson<AiProposal>(`/ai/proposals/${id}`, {
    method: 'PATCH', body: JSON.stringify({ payload }),
  })
}

export async function acceptServerProposal(id: string) {
  return tasklyticApiJson<AiProposal>(`/ai/proposals/${id}:accept`, { method: 'POST' })
}

export async function discardServerProposal(id: string) {
  return tasklyticApiJson<AiProposal>(`/ai/proposals/${id}:discard`, { method: 'POST' })
}

export async function loadAiTeammates(workspaceId: string) {
  return tasklyticApiJson<{ jobs: AiTeammateJob[] }>(`/ai/teammates?workspace_id=${encodeURIComponent(workspaceId)}`)
}

export async function saveAiTeammate(workspaceId: string, body: Partial<AiTeammateJob> & Pick<AiTeammateJob, 'teammate' | 'scope'>) {
  return tasklyticApiJson<AiTeammateJob>('/ai/teammates', {
    method: 'PUT', body: JSON.stringify({ workspaceId, ...body }),
  })
}
