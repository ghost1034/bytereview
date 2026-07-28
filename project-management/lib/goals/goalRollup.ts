/** Parent goal status rollup after child changes. */
import { useGoalsStore, useTasksStore } from '../../stores/entities'
import { computeGoalProgress } from './goalProgress'

/** Propagate computed status up the parentGoalId chain. */
export async function rollupParentStatuses(goalId: string): Promise<void> {
  const store = useGoalsStore.getState()
  const goals = store.list()
  const goal = store.getById(goalId)
  if (!goal?.parentGoalId) return
  const parent = store.getById(goal.parentGoalId)
  if (!parent) return
  const tasks = useTasksStore.getState().list()
  const { percent, statusInferred } = computeGoalProgress(parent.id, goals, tasks)
  await store.update(parent.id, { status: statusInferred })
  if (percent >= 100 && parent.metric.type !== 'manual') {
    const m = parent.metric
    if (m.type === 'percent' || m.type === 'numeric' || m.type === 'currency') {
      await store.update(parent.id, { metric: { ...m, current: m.target } })
    }
  }
  await rollupParentStatuses(parent.id)
}
