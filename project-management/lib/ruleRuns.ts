/** Durable rule-run history and retry API. */
import { tasklyticApiJson } from './tasklyticApi'

export type DurableRuleRun = {
  id: string
  ruleId: string
  taskId: string
  taskName: string
  status: 'pending' | 'leased' | 'retry' | 'succeeded' | 'failed'
  actionsApplied: string[]
  failure?: { code: string; detail: string; details?: { retryable?: boolean } } | null
  createdAt: string
  completedAt?: string | null
  runs: Array<{
    id: string
    attempt: number
    status: 'running' | 'succeeded' | 'retry' | 'failed'
    failure?: { code: string; detail: string } | null
  }>
}

export async function fetchRuleRuns(workspaceId: string, ruleId: string): Promise<DurableRuleRun[]> {
  const response = await tasklyticApiJson<{ runs: DurableRuleRun[] }>(
    `/automation/rules/${encodeURIComponent(ruleId)}/runs?workspace_id=${encodeURIComponent(workspaceId)}`,
  )
  return response.runs
}

export async function retryRuleRun(commandId: string): Promise<void> {
  await tasklyticApiJson(`/automation/runs/${encodeURIComponent(commandId)}/retry`, { method: 'POST' })
}
