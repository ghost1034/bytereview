'use client'

/**
 * Inline AI helpers — draft status composer fields and subtask proposals (step 22 / 07 hooks).
 */
import { format } from 'date-fns'
import { getAiAdapter } from '../../lib/ai'
import { summarizeProjectActivity } from '../status/summaries'
import { useProjectsStore } from '../../stores/entities'
import { buildAiContext } from './contextBuilder'
import type { AiProposal, DraftStatusUpdatePayload } from '../../lib/ai/types'

export type StatusComposerDraft = {
  title: string
  summary: string
  highlights: string
  blockers: string
  nextSteps: string
  status: DraftStatusUpdatePayload['status']
  proposal?: AiProposal
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

/** Draft status update fields from project activity (for inline "Draft from activity" magic button). */
export async function draftStatusUpdateFromActivity(projectId: string): Promise<StatusComposerDraft> {
  const project = useProjectsStore.getState().getById(projectId)
  const context = buildAiContext({ type: 'project', projectId })
  const adapter = getAiAdapter()
  const result = await adapter.generate({
    prompt: 'Draft a status update from recent project activity with title, summary, highlights, blockers, and next steps.',
    context,
  })
  const proposal = result.proposals.find((p) => p.type === 'draft_status_update')
  if (proposal && proposal.type === 'draft_status_update') {
    const p = proposal.payload as DraftStatusUpdatePayload
    return {
      title: p.title,
      summary: stripHtml(p.summaryHtml),
      highlights: stripHtml(p.highlightsHtml ?? ''),
      blockers: stripHtml(p.blockersHtml ?? ''),
      nextSteps: stripHtml(p.nextStepsHtml ?? ''),
      status: p.status,
      proposal,
    }
  }

  const digest = summarizeProjectActivity(projectId)
  return {
    title: `Weekly status — ${project?.name ?? 'Project'} — ${format(new Date(), 'MMM d, yyyy')}`,
    summary: `Completed ${digest.tasksCompleted.length} tasks; ${digest.tasksOverdue.length} overdue.`,
    highlights: digest.tasksCompleted.slice(0, 3).map((t) => t.name).join(', '),
    blockers: digest.tasksOverdue.slice(0, 3).map((t) => t.name).join(', '),
    nextSteps: digest.upcomingDue.slice(0, 3).map((t) => t.name).join(', '),
    status: digest.tasksOverdue.length > 3 ? 'at_risk' : (project?.status ?? 'on_track'),
  }
}

/** Build subtask proposal for a task (inline "Suggest subtasks" magic button). */
export async function buildSubtaskProposal(taskId: string): Promise<AiProposal | null> {
  const context = buildAiContext({ type: 'task', taskId })
  const result = await getAiAdapter().generate({
    prompt: 'Suggest 3-7 subtasks for this task.',
    context,
  })
  return result.proposals.find((p) => p.type === 'create_subtasks') ?? null
}
