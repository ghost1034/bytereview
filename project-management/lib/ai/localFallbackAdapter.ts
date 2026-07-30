/**
 * Deterministic local AI fallback — produces credible summaries from real store data.
 * Used when no Gemini key is configured.
 */
import type { AiAdapter, AiGenerateInput, AiGenerateResult } from './types'
import {
  blockedAnswer,
  descriptionProposal,
  draftStatusProposal,
  matchLocalIntent,
  overdueAnswer,
  smartFieldsProposal,
  subtasksProposal,
  summarizeProjectText,
  summarizeTaskText,
} from './localFallbackHandlers'

/** Local fallback adapter — no network, uses store queries. */
export const localFallbackAdapter: AiAdapter = {
  capabilities: { provider: 'local_fallback' },
  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const scope = input.context.scope
    const intent = matchLocalIntent(input.prompt)

    if (intent === 'draft_status' && scope.type === 'project') {
      const d = draftStatusProposal(scope.projectId)
      return { text: d.text, proposals: [d.proposal] }
    }
    if (intent === 'subtasks' && scope.type === 'task') {
      const s = subtasksProposal(scope.taskId)
      return { text: s.text, proposals: [s.proposal] }
    }
    if (intent === 'description' && scope.type === 'task') {
      const r = descriptionProposal(scope.taskId)
      return { text: r.text, proposals: [r.proposal] }
    }
    if (intent === 'smart_fields' && scope.type === 'task') {
      const f = smartFieldsProposal(scope.taskId)
      return { text: f.text, proposals: [f.proposal] }
    }
    if (intent === 'overdue' && scope.type === 'workspace') {
      return { text: overdueAnswer(scope.workspaceId), proposals: [] }
    }
    if (intent === 'blocked') {
      const wsId = scope.type === 'workspace' ? scope.workspaceId : String(input.context.json.workspaceId ?? '')
      return { text: blockedAnswer(wsId), proposals: [] }
    }
    if (intent === 'summarize') {
      if (scope.type === 'project') return { text: summarizeProjectText(scope.projectId), proposals: [] }
      if (scope.type === 'task') return { text: summarizeTaskText(scope.taskId), proposals: [] }
    }
    if (scope.type === 'project') return { text: summarizeProjectText(scope.projectId), proposals: [] }
    if (scope.type === 'task') return { text: summarizeTaskText(scope.taskId), proposals: [] }

    return {
      text: 'Ask me to summarize a project, draft a status update, suggest subtasks, or check what is overdue.',
      proposals: [],
    }
  },
}
