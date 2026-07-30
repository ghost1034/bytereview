'use client'

/** Topbar running timer chip — export for shell integration. */
import { useState } from 'react'
import { Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTimerStore } from '../../../stores/timerStore'
import { useTasksStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { useElapsedSeconds, formatElapsed } from '../hooks/useElapsedTimer'
import { ManualTimeEntryDialog } from './ManualTimeEntryDialog'
import { buildTimeEntry } from '../../../lib/psa/createTimeEntry'
import {
  useBillingRatesStore,
  useRateCardsStore,
  useTimeEntriesStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../../stores/entities'

export function RunningTimerChip() {
  const running = useTimerStore((s) => s.running)
  const stop = useTimerStore((s) => s.stop)
  const discard = useTimerStore((s) => s.discard)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const elapsed = useElapsedSeconds(running?.startedAt)
  const task = useTasksStore((s) => (running?.taskId ? s.getById(running.taskId) : undefined))
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!running || !currentUserId) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Start timer">
        <Timer className="h-4 w-4" />
      </Button>
    )
  }

  const saveTimer = async () => {
    const snap = stop()
    if (!snap) return
    const hours = Math.max(0.01, Math.round((elapsed / 3600) * 100) / 100)
    const user = useUsersStore.getState().getById(snap.userId)
    const workspace = useWorkspacesStore.getState().getById(snap.workspaceId)
    const entry = buildTimeEntry({
      workspaceId: snap.workspaceId,
      userId: snap.userId,
      user,
      workspace,
      date: new Date().toISOString().slice(0, 10),
      hours,
      description: snap.description || task?.name || 'Timer entry',
      billable: snap.billable,
      taskId: snap.taskId,
      projectId: snap.projectId,
      matterId: snap.matterId,
      clientId: snap.clientId,
      activityCode: snap.activityCode,
      startedAt: snap.startedAt,
      stoppedAt: new Date().toISOString(),
      billingRates: useBillingRatesStore.getState().list(),
      rateCards: useRateCardsStore.getState().list(),
    })
    await useTimeEntriesStore.getState().add(entry)
    setConfirmOpen(false)
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" className={`gap-1 font-mono tabular-nums glow-pulse`} aria-live="polite">
            ▶ {task?.name?.slice(0, 20) ?? 'Timer'} · {formatElapsed(elapsed)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="tl-popover-surface w-64" align="end">
          <p className="mb-2 text-sm font-medium">{task?.name ?? 'Running timer'}</p>
          <p className="mb-3 font-mono tabular-nums text-lg">{formatElapsed(elapsed)}</p>
          <div className="flex gap-2">
            <Button size="sm" className="tl-btn-primary flex-1 border-0" onClick={() => void saveTimer()}>Stop & save</Button>
            <Button size="sm" variant="outline" onClick={() => discard()}>Discard</Button>
          </div>
        </PopoverContent>
      </Popover>
      {confirmOpen && running && (
        <ManualTimeEntryDialog open={confirmOpen} onOpenChange={setConfirmOpen} workspaceId={running.workspaceId} userId={running.userId} defaultHours={elapsed / 3600} />
      )}
    </>
  )
}
