/**
 * Workspace query helpers for AI answers — overdue, blocked, at-risk tasks.
 */
import { isBefore, parseISO, startOfDay } from 'date-fns'
import type { Task } from '../../types'
import { useProjectsStore, useTasksStore } from '../../stores/entities'

function workspaceTasks(workspaceId: string): Task[] {
  return useTasksStore.getState().list().filter((t) => t.workspaceId === workspaceId)
}

/** Incomplete tasks with due date before today. */
export function queryOverdueTasks(workspaceId: string): Task[] {
  const today = startOfDay(new Date())
  return workspaceTasks(workspaceId).filter(
    (t) => !t.completed && t.dueOn && isBefore(parseISO(t.dueOn), today)
  )
}

/** Tasks in at-risk/off-track projects or with overdue due dates. */
export function queryBlockedTasks(workspaceId: string): Task[] {
  const projects = useProjectsStore.getState().list()
  const risky = new Set(
    projects
      .filter((p) => p.workspaceId === workspaceId && (p.status === 'at_risk' || p.status === 'off_track'))
      .map((p) => p.id)
  )
  const overdue = new Set(queryOverdueTasks(workspaceId).map((t) => t.id))
  return workspaceTasks(workspaceId).filter(
    (t) => !t.completed && (overdue.has(t.id) || t.projectIds.some((pid) => risky.has(pid)))
  )
}
