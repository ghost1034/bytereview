/** Goal notification helpers for status and metric changes. */
import { createNotification } from '../notifications'
import { useGoalsStore, useUsersStore } from '../../stores/entities'
import { getGoalFollowers } from './goalMeta'

/** Notify owner and followers of a goal status update. */
export async function notifyGoalStatusUpdate(
  goalId: string,
  actorId: string,
  title: string,
  updateId: string
): Promise<void> {
  const goal = useGoalsStore.getState().getById(goalId)
  if (!goal) return
  const actor = useUsersStore.getState().getById(actorId)
  const recipients = new Set([goal.ownerId, ...getGoalFollowers(goalId)])
  recipients.delete(actorId)
  await Promise.all(
    [...recipients].map((userId) =>
      createNotification({
        userId,
        actorId,
        type: 'status_update',
        scope: { type: 'goal', id: goalId },
        message: `${actor?.name ?? 'Someone'} posted "${title}" on goal ${goal.name}`,
        metadata: { updateId, subtype: 'goal_status_update' },
      })
    )
  )
}

/** Notify when progress changes by ≥10%. */
export async function notifyGoalMetricChange(
  goalId: string,
  actorId: string,
  from: number,
  to: number
): Promise<void> {
  const goal = useGoalsStore.getState().getById(goalId)
  if (!goal) return
  const actor = useUsersStore.getState().getById(actorId)
  const recipients = new Set([goal.ownerId, ...getGoalFollowers(goalId)])
  recipients.delete(actorId)
  await Promise.all(
    [...recipients].map((userId) =>
      createNotification({
        userId,
        actorId,
        type: 'status_update',
        scope: { type: 'goal', id: goalId },
        message: `${actor?.name ?? 'Someone'} updated ${goal.name} progress (${from}% → ${to}%)`,
        metadata: { from, to, subtype: 'goal_metric_change' },
      })
    )
  )
}
