'use client'

/** Start/stop timer button for task detail pane — export only. */
import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTimerStore } from '../../../stores/timerStore'
import { useAuthStore } from '../../../stores/auth'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { ManualTimeEntryDialog } from './ManualTimeEntryDialog'
import { useElapsedSeconds } from '../hooks/useElapsedTimer'
import type { Task } from '../../../types'

type Props = { task: Task }

export function TaskTrackTimerButton({ task }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const running = useTimerStore((s) => s.running)
  const start = useTimerStore((s) => s.start)
  const stop = useTimerStore((s) => s.stop)
  const elapsed = useElapsedSeconds(running?.taskId === task.id ? running.startedAt : undefined)
  const [stopDialog, setStopDialog] = useState(false)
  const isRunning = running?.taskId === task.id

  if (!workspaceId || !userId) return null

  const onClick = () => {
    if (isRunning) {
      stop()
      setStopDialog(true)
      return
    }
    if (running && running.taskId !== task.id) {
      const ok = window.confirm('Stop and save current timer first?')
      if (!ok) return
      useTimerStore.getState().discard()
    }
    start({
      workspaceId,
      userId,
      taskId: task.id,
      projectId: task.projectIds[0],
      startedAt: new Date().toISOString(),
      description: task.name,
      billable: true,
    })
  }

  return (
    <>
      <Button size="sm" variant={isRunning ? 'destructive' : 'default'} className={isRunning ? '' : 'tl-btn-primary border-0'} onClick={onClick}>
        {isRunning ? <><Square className="mr-1 h-3 w-3" /> Stop</> : <><Play className="mr-1 h-3 w-3" /> Start timer</>}
      </Button>
      {stopDialog && (
        <ManualTimeEntryDialog
          open={stopDialog}
          onOpenChange={setStopDialog}
          workspaceId={workspaceId}
          userId={userId}
          task={task}
          defaultDescription={task.name}
          defaultHours={Math.max(0.01, Math.round((elapsed / 3600) * 100) / 100)}
        />
      )}
    </>
  )
}
