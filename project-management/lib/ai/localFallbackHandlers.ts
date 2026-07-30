/**
 * Local fallback intent handlers — deterministic summaries from store data.
 */
import { format, addDays } from 'date-fns'
import { newId } from '../ids'
import { summarizeProjectActivity } from '../../features/status/summaries'
import {
  useCommentsStore,
  useCustomFieldsStore,
  useProjectsStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import type {
  AiProposal,
  CreateSubtasksPayload,
  DraftStatusUpdatePayload,
  SmartFieldsPayload,
  UpdateDescriptionPayload,
} from './types'
import { queryBlockedTasks, queryOverdueTasks } from '../../features/ai/workspaceQueries'

function wrapP(text: string): string {
  return `<p>${text}</p>`
}

export function summarizeProjectText(projectId: string): string {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) return 'Project not found.'
  const digest = summarizeProjectActivity(projectId)
  const tasks = useTasksStore.getState().list().filter((t) => t.projectIds.includes(projectId))
  const done = tasks.filter((t) => t.completed).length
  const total = tasks.length
  const pct = total ? Math.round((done / total) * 100) : 0
  return [
    `${project.name} is ${project.status?.replace('_', ' ') ?? 'active'} with ${total} tasks (${pct}% complete).`,
    `${digest.tasksCompleted.length} tasks were completed recently; ${digest.tasksOverdue.length} are overdue.`,
    `${digest.upcomingDue.length} tasks are due within the next week.`,
    digest.topContributors.length
      ? `Top contributors: ${digest.topContributors.map((u) => u.name).join(', ')}.`
      : 'No recent completion activity recorded yet.',
    digest.recentMilestones.length
      ? `Recent milestones: ${digest.recentMilestones.map((m) => m.name).join(', ')}.`
      : 'Focus on clearing overdue items and posting a status update this week.',
  ].join(' ')
}

export function summarizeTaskText(taskId: string): string {
  const task = useTasksStore.getState().getById(taskId)
  if (!task) return 'Task not found.'
  const subtasks = useTasksStore.getState().list().filter((t) => t.parentId === taskId)
  const comments = useCommentsStore.getState().list().filter((c) => c.taskId === taskId)
  const assignee = task.assigneeId ? useUsersStore.getState().getById(task.assigneeId)?.name : 'Unassigned'
  return [
    `"${task.name}" is ${task.completed ? 'complete' : 'in progress'}, assigned to ${assignee}.`,
    task.dueOn ? `Due date: ${task.dueOn}.` : 'No due date set.',
    task.notes ? 'Has a description on file.' : 'No description yet.',
    `${subtasks.length} subtasks; ${comments.length} comments.`,
    task.completed ? 'Nothing further required unless you want a retrospective summary.' : 'Consider breaking this into subtasks or updating the status.',
  ].join(' ')
}

export function draftStatusProposal(projectId: string): { text: string; proposal: AiProposal } {
  const project = useProjectsStore.getState().getById(projectId)
  const digest = summarizeProjectActivity(projectId)
  const title = `Weekly status — ${project?.name ?? 'Project'} — ${format(new Date(), 'MMM d, yyyy')}`
  const payload: DraftStatusUpdatePayload = {
    projectId,
    status: digest.tasksOverdue.length > 3 ? 'at_risk' : (project?.status ?? 'on_track'),
    title,
    summaryHtml: wrapP(`Completed ${digest.tasksCompleted.length} tasks this week. ${digest.tasksOverdue.length} items remain overdue.`),
    highlightsHtml: wrapP(digest.tasksCompleted.slice(0, 3).map((t) => t.name).join('; ') || 'Steady progress across the board.'),
    blockersHtml: wrapP(digest.tasksOverdue.slice(0, 3).map((t) => t.name).join('; ') || 'No major blockers identified.'),
    nextStepsHtml: wrapP(digest.upcomingDue.slice(0, 3).map((t) => t.name).join('; ') || 'Prioritize overdue tasks and confirm owners.'),
  }
  return {
    text: 'Drafted a status update from recent project activity. Review and apply when ready.',
    proposal: { id: newId(), type: 'draft_status_update', title: 'Draft status update', preview: `${payload.title}\n${payload.summaryHtml.replace(/<[^>]+>/g, '')}`, payload },
  }
}

export function subtasksProposal(taskId: string): { text: string; proposal: AiProposal } {
  const task = useTasksStore.getState().getById(taskId)
  const base = task?.name ?? 'Task'
  const names = [`Research scope for ${base}`, `Draft initial deliverable for ${base}`, `Review and finalize ${base}`, `Share update on ${base}`]
  const payload: CreateSubtasksPayload = { parentTaskId: taskId, names }
  return {
    text: `Suggested ${names.length} subtasks based on "${base}". Select Apply to create them.`,
    proposal: { id: newId(), type: 'create_subtasks', title: 'Add subtasks', preview: names.map((n, i) => `${i + 1}. ${n}`).join('\n'), payload },
  }
}

export function smartFieldsProposal(taskId: string): { text: string; proposal: AiProposal } {
  const task = useTasksStore.getState().getById(taskId)
  const users = useUsersStore.getState().list()
  const assignee = users.find((u) => u.id !== task?.assigneeId) ?? users[0]
  const priorityField = useCustomFieldsStore.getState().list().find((f) => f.name === 'Priority' && f.workspaceId === task?.workspaceId)
  const dueOn = format(addDays(new Date(), 5), 'yyyy-MM-dd')
  const preview: Record<string, string> = { Assignee: assignee?.name ?? '—', 'Due date': dueOn }
  if (priorityField?.options?.[1]) preview.Priority = priorityField.options[1].label
  const payload: SmartFieldsPayload = { taskId, assigneeId: assignee?.id, dueOn, priorityFieldId: priorityField?.id, priorityOptionId: priorityField?.options?.[1]?.id, preview }
  return {
    text: 'Suggested field updates based on workload patterns in this workspace.',
    proposal: { id: newId(), type: 'smart_fields', title: 'Update task fields', preview: Object.entries(preview).map(([k, v]) => `${k}: ${v}`).join('\n'), payload },
  }
}

export function descriptionProposal(taskId: string): { text: string; proposal: AiProposal } {
  const task = useTasksStore.getState().getById(taskId)
  const prev = task?.notes ?? ''
  const plain = prev.replace(/<[^>]+>/g, '').trim()
  const next = plain
    ? `<h3>Overview</h3><p>${plain}</p><h3>Acceptance criteria</h3><ul><li>Define done state</li><li>Confirm owner and due date</li></ul>`
    : `<h3>Overview</h3><p>Describe the goal for "${task?.name ?? 'this task'}".</p><h3>Next steps</h3><ul><li>Add context</li><li>Break into subtasks</li></ul>`
  const payload: UpdateDescriptionPayload = { taskId, previousNotes: prev, nextNotes: next }
  return {
    text: 'Prepared a clearer structured description. Review the diff before applying.',
    proposal: { id: newId(), type: 'update_description', title: 'Improve description', preview: `Before: ${plain.slice(0, 120) || '(empty)'}\nAfter: structured HTML with overview + criteria`, payload },
  }
}

export function matchLocalIntent(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes('status') && (p.includes('draft') || p.includes('update'))) return 'draft_status'
  if (p.includes('subtask') || p.includes('break down') || p.includes('breakdown')) return 'subtasks'
  if (p.includes('description') || p.includes('rewrite') || p.includes('expand')) return 'description'
  if (p.includes('priority') || p.includes('assignee') || p.includes('smart field')) return 'smart_fields'
  if (p.includes('overdue')) return 'overdue'
  if (p.includes('blocked')) return 'blocked'
  if (p.includes('summarize') || p.includes('summary')) return 'summarize'
  return 'general'
}

export function overdueAnswer(workspaceId: string): string {
  const items = queryOverdueTasks(workspaceId)
  return items.length ? `${items.length} overdue tasks: ${items.slice(0, 8).map((t) => t.name).join('; ')}.` : 'No overdue tasks in this workspace.'
}

export function blockedAnswer(workspaceId: string): string {
  const items = queryBlockedTasks(workspaceId)
  return items.length ? `${items.length} blocked/at-risk items: ${items.slice(0, 8).map((t) => t.name).join('; ')}.` : 'Nothing flagged as blocked right now.'
}
