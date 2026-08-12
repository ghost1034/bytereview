import type { Project, ProjectStatus, ProjectView, Task } from '../../types'
import { formatDate } from '../../lib/time'

export const PROJECT_VIEWS: ProjectView[] = ['list', 'board', 'calendar', 'timeline', 'gantt']

export function normalizeProjectView(view: ProjectView | 'overview' | 'messages' | null | undefined): ProjectView | 'overview' | 'messages' {
  if (!view || view === 'overview' || view === 'messages') return view ?? 'overview'
  return view
}

export function activeProjectViews(enabled?: ProjectView[]): ProjectView[] {
  const raw = enabled ?? PROJECT_VIEWS
  return [...new Set(raw)].filter((v) => PROJECT_VIEWS.includes(v))
}

export const VIEW_LABELS: Record<ProjectView, string> = {
  list: 'List',
  board: 'Board',
  calendar: 'Calendar',
  timeline: 'Timeline',
  gantt: 'Gantt',
}

export const STATUS_LABELS: Record<Exclude<ProjectStatus, null>, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  on_hold: 'On hold',
  complete: 'Complete',
}

export const PRIVACY_LABELS: Record<Project['privacy'], string> = {
  public_to_team: 'Public to team',
  private_to_members: 'Private to members',
  public_to_workspace: 'Public to workspace',
}

/** Task completion ratio for a project (0–100). */
export function projectProgress(tasks: Task[], projectId: string): number {
  const scoped = tasks.filter((t) => t.projectIds.includes(projectId))
  if (!scoped.length) return 0
  return Math.round((scoped.filter((t) => t.completed).length / scoped.length) * 100)
}

/** Human-readable due date for project cards. */
export function projectDueLabel(dueOn?: string): string | null {
  return dueOn ? formatDate(dueOn) : null
}
