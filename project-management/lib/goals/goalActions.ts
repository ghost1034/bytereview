/**
 * Goal mutations — create, update, progress, and status updates.
 */
import { newId } from '../ids'
import { now } from '../time'
import { projectProgress } from '../../features/projects/projectUtils'
import {
  useGoalsStore,
  useStatusUpdatesStore,
  useTasksStore,
} from '../../stores/entities'
import type { Goal, StatusUpdate } from '../../types'
import { notifyGoalMetricChange, notifyGoalStatusUpdate } from './goalNotifications'
import {
  computeGoalProgress,
  getMetricProgressPercent,
  inferStatusFromPercent,
} from './goalProgress'
import { rollupParentStatuses } from './goalRollup'
import { wouldCreateGoalCycle } from './goalTree'

export type SaveGoalInput = {
  workspaceId: string
  name: string
  description?: string
  ownerId: string
  parentGoalId?: string
  timeFrame: Goal['timeFrame']
  metric: Goal['metric']
  privacy: Goal['privacy']
  supportingProjectIds: string[]
  supportingGoalIds: string[]
  rollupWeight?: number
  supportingGoalWeights?: Record<string, number>
  supportingProjectWeights?: Record<string, number>
  status?: Goal['status']
}

/** Persist a new goal. */
export async function createGoal(input: SaveGoalInput): Promise<Goal> {
  let status: Goal['status'] = input.status ?? 'on_track'
  if (!input.status) {
    if (input.metric.type === 'manual') {
      status = input.metric.status
    } else {
      const pct = getMetricProgressPercent({
        id: '',
        workspaceId: input.workspaceId,
        name: input.name,
        ownerId: input.ownerId,
        timeFrame: input.timeFrame,
        metric: input.metric,
        status: 'on_track',
        supportingProjectIds: [],
        supportingGoalIds: [],
        privacy: input.privacy,
        createdAt: now(),
      })
      status = inferStatusFromPercent(pct)
    }
  }

  const goal: Goal = {
    id: newId(),
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    ownerId: input.ownerId,
    parentGoalId: input.parentGoalId,
    timeFrame: input.timeFrame,
    metric: input.metric,
    status,
    supportingProjectIds: input.supportingProjectIds,
    supportingGoalIds: input.supportingGoalIds,
    rollupWeight: input.rollupWeight,
    supportingGoalWeights: input.supportingGoalWeights,
    supportingProjectWeights: input.supportingProjectWeights,
    privacy: input.privacy,
    createdAt: now(),
  }
  await useGoalsStore.getState().add(goal)
  return goal
}

/** Update an existing goal; validates parent cycle. */
export async function updateGoal(goalId: string, patch: Partial<Goal>): Promise<void> {
  const goals = useGoalsStore.getState().list()
  if (patch.parentGoalId !== undefined && wouldCreateGoalCycle(goals, goalId, patch.parentGoalId)) {
    return
  }
  await useGoalsStore.getState().update(goalId, patch)
}

/** Re-parent a goal (tree drag). */
export async function reparentGoal(goalId: string, newParentId: string | undefined): Promise<boolean> {
  const goals = useGoalsStore.getState().list()
  if (wouldCreateGoalCycle(goals, goalId, newParentId)) return false
  await useGoalsStore.getState().update(goalId, { parentGoalId: newParentId })
  return true
}

export type UpdateGoalProgressInput = {
  goalId: string
  actorId: string
  metric?: Goal['metric']
  postUpdate?: boolean
  updateTitle?: string
  updateSummary?: string
}

function mapGoalStatusToUpdateStatus(status: Goal['status']): StatusUpdate['status'] {
  if (status === 'achieved') return 'complete'
  if (status === 'at_risk') return 'at_risk'
  if (status === 'off_track' || status === 'missed') return 'off_track'
  return 'on_track'
}

/** Set metric current/status, recompute parent rollups, optionally notify. */
export async function updateGoalProgress(input: UpdateGoalProgressInput): Promise<void> {
  const store = useGoalsStore.getState()
  const goal = store.getById(input.goalId)
  if (!goal) return

  const tasks = useTasksStore.getState().list()
  const prevPercent = computeGoalProgress(goal.id, store.list(), tasks).percent
  const metric = input.metric ?? goal.metric
  let status = goal.status
  if (metric.type === 'manual') {
    status = metric.status
  } else {
    status = inferStatusFromPercent(getMetricProgressPercent({ ...goal, metric }))
  }

  await store.update(input.goalId, { metric, status })

  const nextPercent = computeGoalProgress(input.goalId, store.list(), tasks).percent
  if (Math.abs(nextPercent - prevPercent) >= 10) {
    await notifyGoalMetricChange(input.goalId, input.actorId, prevPercent, nextPercent)
  }

  if (input.postUpdate) {
    await postGoalStatusUpdate({
      goalId: input.goalId,
      authorId: input.actorId,
      status: mapGoalStatusToUpdateStatus(status),
      title: input.updateTitle ?? `Progress update — ${goal.name}`,
      summaryHtml: input.updateSummary ?? `<p>Progress is now ${nextPercent}%.</p>`,
    })
  } else {
    await rollupParentStatuses(input.goalId)
  }
}

export type PostGoalStatusUpdateInput = {
  goalId: string
  authorId: string
  status: StatusUpdate['status']
  title: string
  summaryHtml: string
  highlightsHtml?: string
  blockersHtml?: string
  nextStepsHtml?: string
}

/** Post a goal-scoped status update and sync goal pill. */
export async function postGoalStatusUpdate(input: PostGoalStatusUpdateInput): Promise<StatusUpdate> {
  const update: StatusUpdate = {
    id: newId(),
    scope: { type: 'goal', id: input.goalId },
    authorId: input.authorId,
    status: input.status,
    title: input.title.trim(),
    summaryHtml: input.summaryHtml,
    highlightsHtml: input.highlightsHtml,
    blockersHtml: input.blockersHtml,
    nextStepsHtml: input.nextStepsHtml,
    createdAt: now(),
  }
  await useStatusUpdatesStore.getState().add(update)

  const goalStatus: Goal['status'] =
    input.status === 'complete'
      ? 'achieved'
      : input.status === 'at_risk'
        ? 'at_risk'
        : input.status === 'off_track'
          ? 'off_track'
          : 'on_track'
  await useGoalsStore.getState().update(input.goalId, { status: goalStatus })
  await rollupParentStatuses(input.goalId)
  await notifyGoalStatusUpdate(input.goalId, input.authorId, update.title, update.id)
  return update
}

/** Project completion percent for supporting project display. */
export function getProjectCompletionPercent(projectId: string): number {
  return projectProgress(useTasksStore.getState().list(), projectId)
}
