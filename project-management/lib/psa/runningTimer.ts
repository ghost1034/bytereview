/** Accurate elapsed-time capture and TimeEntry creation for running timers. */
import { buildTimeEntry } from './createTimeEntry'
import {
  useBillingRatesStore,
  useMattersStore,
  useProjectsStore,
  useRateCardsStore,
  useTasksStore,
  useTimeEntriesStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../stores/entities'
import type { RunningTimer } from '../../stores/timerStore'
import { elapsedTimerSeconds } from './elapsedTimer'
import { resolveLinkedMatter } from './resolvePsaLinks'

export { elapsedTimerSeconds } from './elapsedTimer'

export async function saveRunningTimer(timer: RunningTimer, stoppedAt = new Date().toISOString()) {
  const elapsedSeconds = Math.max(1, elapsedTimerSeconds(timer.startedAt, stoppedAt))
  const hours = Math.round((elapsedSeconds / 3600) * 1_000_000) / 1_000_000
  const task = timer.taskId ? useTasksStore.getState().getById(timer.taskId) : undefined
  const project = timer.projectId ? useProjectsStore.getState().getById(timer.projectId) : undefined
  const matter = resolveLinkedMatter(useMattersStore.getState().list(), project, timer.matterId)
  const entry = buildTimeEntry({
    workspaceId: timer.workspaceId,
    userId: timer.userId,
    user: useUsersStore.getState().getById(timer.userId),
    workspace: useWorkspacesStore.getState().getById(timer.workspaceId),
    project,
    matter,
    date: stoppedAt.slice(0, 10),
    hours,
    description: timer.description.trim() || task?.name || 'Timer entry',
    billable: timer.billable,
    taskId: timer.taskId,
    projectId: timer.projectId,
    matterId: matter?.id,
    clientId: timer.clientId ?? matter?.clientId ?? project?.clientId,
    activityCode: timer.activityCode,
    taskCode: timer.taskCode,
    startedAt: timer.startedAt,
    stoppedAt,
    billingRates: useBillingRatesStore.getState().list(),
    rateCards: useRateCardsStore.getState().list(),
  })
  entry.durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60))
  await useTimeEntriesStore.getState().add(entry)
  return entry
}
