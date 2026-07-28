/**
 * Goal progress computation — metric, rollup, project-driven, and hook.
 */
'use client'

import { useMemo } from 'react'
import { projectProgress } from '../../features/projects/projectUtils'
import { useGoalsStore, useTasksStore } from '../../stores/entities'
import type { Goal } from '../../types'
import { getGoalProgressMode } from './goalMeta'
import { getChildGoals } from './goalTree'

export type GoalProgressResult = {
  percent: number
  statusInferred: Goal['status']
  isProjectDriven: boolean
  isAutoProgress: boolean
}

const MANUAL_PERCENT: Record<'on_track' | 'at_risk' | 'off_track', number> = {
  on_track: 80,
  at_risk: 40,
  off_track: 10,
}

/** Progress percent from a goal's own metric (no rollup). */
export function getMetricProgressPercent(goal: Goal): number {
  const { metric } = goal
  if (metric.type === 'manual') return MANUAL_PERCENT[metric.status]
  if (!metric.target) return 0
  const pct = Math.round((metric.current / metric.target) * 100)
  return Math.min(100, Math.max(0, pct))
}

/** Infer goal status from a progress percent. */
export function inferStatusFromPercent(percent: number): Goal['status'] {
  if (percent >= 100) return 'achieved'
  if (percent >= 70) return 'on_track'
  if (percent >= 40) return 'at_risk'
  return 'off_track'
}

/** Average of numeric values (equal weight). Future: custom weights per Design.md TODO. */
function average(values: number[]): number {
  if (!values.length) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/** Compute full progress for a goal including rollups. */
export function computeGoalProgress(
  goalId: string,
  goals: Goal[],
  tasks: Parameters<typeof projectProgress>[0]
): GoalProgressResult {
  const goal = goals.find((g) => g.id === goalId)
  if (!goal) {
    return { percent: 0, statusInferred: 'off_track', isProjectDriven: false, isAutoProgress: false }
  }

  const children = getChildGoals(goals, goalId)
  const isAuto = getGoalProgressMode(goalId) === 'auto'

  if (children.length > 0) {
    const childPercents = children.map((c) => computeGoalProgress(c.id, goals, tasks).percent)
    const percent = average(childPercents)
    return {
      percent,
      statusInferred: inferStatusFromPercent(percent),
      isProjectDriven: false,
      isAutoProgress: true,
    }
  }

  if (isAuto) {
    const sources: number[] = []
    let hasProjects = false
    goal.supportingGoalIds?.forEach((id) => {
      sources.push(computeGoalProgress(id, goals, tasks).percent)
    })
    goal.supportingProjectIds?.forEach((pid) => {
      hasProjects = true
      sources.push(projectProgress(tasks, pid))
    })
    if (sources.length > 0) {
      const percent = average(sources)
      return {
        percent,
        statusInferred: inferStatusFromPercent(percent),
        isProjectDriven: hasProjects,
        isAutoProgress: true,
      }
    }
  }

  const percent = getMetricProgressPercent(goal)
  const statusInferred =
    goal.metric.type === 'manual'
      ? goal.metric.status === 'on_track'
        ? 'on_track'
        : goal.metric.status === 'at_risk'
          ? 'at_risk'
          : 'off_track'
      : inferStatusFromPercent(percent)

  return { percent, statusInferred, isProjectDriven: false, isAutoProgress: isAuto }
}

/** Hook — reactive goal progress for UI. */
export function useGoalProgress(goalId: string | undefined): GoalProgressResult {
  const goals = useGoalsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  return useMemo(
    () => (goalId ? computeGoalProgress(goalId, goals, tasks) : {
      percent: 0,
      statusInferred: 'off_track' as const,
      isProjectDriven: false,
      isAutoProgress: false,
    }),
    [goalId, goals, tasks]
  )
}

export function getGoalStatusColor(status: Goal['status']): string {
  switch (status) {
    case 'on_track':
    case 'achieved':
      return 'var(--accent)'
    case 'at_risk':
      return 'var(--warning)'
    case 'off_track':
    case 'missed':
      return 'var(--destructive, #e11d48)'
    default:
      return 'var(--ink-muted)'
  }
}

export function formatGoalStatus(status: Goal['status']): string {
  return status.replace(/_/g, ' ')
}

/** @deprecated Use computeGoalProgress or useGoalProgress */
export function getGoalProgressPercent(goal: Goal): number {
  const goals = useGoalsStore.getState().list()
  const tasks = useTasksStore.getState().list()
  return computeGoalProgress(goal.id, goals, tasks).percent
}
