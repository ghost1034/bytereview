/**
 * Tasklytic AI adapter contract — swappable Gemini / server proxy / local fallback.
 */

export type AiContextScope =
  | { type: 'workspace'; workspaceId: string }
  | { type: 'project'; projectId: string }
  | { type: 'task'; taskId: string }
  | { type: 'goal'; goalId: string }
  | { type: 'portfolio'; portfolioId: string }
  | { type: 'dashboard'; dashboardId: string }

/** Structured workspace snapshot passed to the model (not raw HTML). */
export type AiContextBundle = {
  scope: AiContextScope
  label: string
  json: Record<string, unknown>
}

export type AiChatRole = 'user' | 'assistant'

export type AiProposalType =
  | 'draft_status_update'
  | 'create_subtasks'
  | 'update_description'
  | 'smart_fields'
  | 'create_task'
  | 'add_custom_field'
  | 'create_rule'
  | 'add_chart_to_dashboard'
  | 'summarize'
  | 'propose_assignees'

export type DraftStatusUpdatePayload = {
  projectId: string
  status: 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete'
  title: string
  summaryHtml: string
  highlightsHtml?: string
  blockersHtml?: string
  nextStepsHtml?: string
}

export type CreateSubtasksPayload = {
  parentTaskId: string
  names: string[]
}

export type UpdateDescriptionPayload = {
  taskId: string
  previousNotes: string
  nextNotes: string
}

export type SmartFieldsPayload = {
  taskId: string
  assigneeId?: string
  dueOn?: string
  priorityOptionId?: string
  priorityFieldId?: string
  preview: Record<string, string>
}

export type CreateTaskPayload = {
  workspaceId: string
  projectId?: string
  name: string
  assigneeId?: string
  dueOn?: string
}

export type AiProposalPayload =
  | DraftStatusUpdatePayload
  | CreateSubtasksPayload
  | UpdateDescriptionPayload
  | SmartFieldsPayload
  | CreateTaskPayload
  | Record<string, unknown>

/** User-confirmed mutation suggested by the assistant. */
export type AiProposal = {
  id: string
  type: AiProposalType
  title: string
  preview: string
  reasoning?: string
  payload: AiProposalPayload
  status?: 'pending' | 'accepted' | 'discarded'
  revision?: number
}

export type AiGenerateInput = {
  prompt: string
  context: AiContextBundle
  history?: { role: AiChatRole; content: string }[]
  threadId?: string
}

export type AiGenerateResult = {
  text: string
  reasoning?: string
  proposals: AiProposal[]
}

/** Swappable AI seam — production: server proxy with key rotation. */
export interface AiAdapter {
  generate(input: AiGenerateInput): Promise<AiGenerateResult>
  readonly capabilities: {
    provider: 'gemini' | 'local_fallback'
    model?: string
  }
}

export type GeminiModelId = string
export type VertexModelOption = { id: string; label: string; default?: boolean }
