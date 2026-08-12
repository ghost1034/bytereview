'use client'

/** Global persisted-timer recovery banner. */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTimerStore } from '../../../stores/timerStore'
import { useTasksStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { useElapsedSeconds, formatElapsed } from '../hooks/useElapsedTimer'
import { TimerTransitionDialog } from './TimerTransitionDialog'

export function TimerBanner() {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const running = useTimerStore((s) => currentUserId ? s.runningByUser[currentUserId] ?? null : null)
  const discard = useTimerStore((s) => s.discard)
  const task = useTasksStore((s) => (running?.taskId ? s.getById(running.taskId) : undefined))
  const elapsed = useElapsedSeconds(running?.startedAt)
  const [hidden, setHidden] = useState(false)
  const [transitionOpen, setTransitionOpen] = useState(false)

  useEffect(() => setHidden(false), [running?.startedAt])

  if (!running || hidden) return null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm" style={{ background: 'var(--accent-soft)', borderColor: 'var(--border-subtle)' }} role="status" aria-live="polite">
        <span>You have a running timer on <strong>{task?.name ?? 'a task'}</strong> · {formatElapsed(elapsed)}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setTransitionOpen(true)}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>Continue</Button>
          <Button size="sm" variant="ghost" onClick={() => discard(running.userId)}>Discard</Button>
        </div>
      </div>
      <TimerTransitionDialog open={transitionOpen} onOpenChange={setTransitionOpen} running={running} />
    </>
  )
}
