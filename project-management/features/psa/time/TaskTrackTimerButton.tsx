'use client'

/** Start, stop, or switch the current user's one running timer. */
import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTimerStore, type RunningTimer } from '../../../stores/timerStore'
import { useAuthStore } from '../../../stores/auth'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import type { Task } from '../../../types'
import { TimerTransitionDialog } from './TimerTransitionDialog'

export function TaskTrackTimerButton({ task }: { task: Task }) {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const running = useTimerStore((s) => userId ? s.runningByUser[userId] ?? null : null)
  const start = useTimerStore((s) => s.start)
  const [transitionOpen, setTransitionOpen] = useState(false)
  const isRunning = running?.taskId === task.id

  if (!workspaceId || !userId) return null

  const nextTimer: RunningTimer = {
    workspaceId,
    userId,
    taskId: task.id,
    projectId: task.projectIds[0],
    startedAt: new Date().toISOString(),
    description: task.name,
    billable: true,
  }

  const onClick = () => {
    if (running) setTransitionOpen(true)
    else start(nextTimer)
  }

  return (
    <>
      <Button size="sm" variant={isRunning ? 'destructive' : 'default'} className={isRunning ? '' : 'tl-btn-primary border-0'} onClick={onClick}>
        {isRunning ? <><Square className="mr-1 h-3 w-3" /> Stop</> : <><Play className="mr-1 h-3 w-3" /> Start timer</>}
      </Button>
      {running ? (
        <TimerTransitionDialog
          open={transitionOpen}
          onOpenChange={setTransitionOpen}
          running={running}
          nextTimer={isRunning ? undefined : nextTimer}
        />
      ) : null}
    </>
  )
}
