'use client'

/** Persistent banner when a timer is running after reload. */
import { Button } from '@/components/ui/button'
import { useTimerStore } from '../../../stores/timerStore'
import { useTasksStore } from '../../../stores/entities'
import { useElapsedSeconds, formatElapsed } from '../hooks/useElapsedTimer'

export function TimerBanner() {
  const running = useTimerStore((s) => s.running)
  const discard = useTimerStore((s) => s.discard)
  const elapsed = useElapsedSeconds(running?.startedAt)
  const task = useTasksStore((s) => (running?.taskId ? s.getById(running.taskId) : undefined))

  if (!running) return null

  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm" style={{ background: 'var(--accent-soft)', borderColor: 'var(--border-subtle)' }} role="status" aria-live="polite">
      <span>You have a running timer on <strong>{task?.name ?? 'a task'}</strong> · {formatElapsed(elapsed)}</span>
      <Button size="sm" variant="ghost" onClick={() => discard()}>Discard</Button>
    </div>
  )
}
