'use client'

/** Topbar timer chip with quick start and running controls. */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Play, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTimerStore, type RunningTimer } from '../../../stores/timerStore'
import { useTasksStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { useElapsedSeconds, formatElapsed } from '../hooks/useElapsedTimer'
import { TimerTransitionDialog } from './TimerTransitionDialog'

type Props = { open?: boolean; onOpenChange?: (open: boolean) => void }

export function RunningTimerChip({ open, onOpenChange }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const running = useTimerStore((s) => currentUserId ? s.runningByUser[currentUserId] ?? null : null)
  const start = useTimerStore((s) => s.start)
  const discard = useTimerStore((s) => s.discard)
  const tasks = useTasksStore((s) => s.list().filter((task) => task.workspaceId === workspaceId && !task.completed))
  const task = tasks.find((row) => row.id === running?.taskId)
  const elapsed = useElapsedSeconds(running?.startedAt)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(true)
  const [transitionOpen, setTransitionOpen] = useState(false)

  const selectedTask = useMemo(() => tasks.find((row) => row.id === selectedTaskId), [selectedTaskId, tasks])
  useEffect(() => {
    if (selectedTask && !description) setDescription(selectedTask.name)
  }, [description, selectedTask])

  const quickStart = () => {
    if (!workspaceId || !currentUserId || !selectedTask) return
    const timer: RunningTimer = {
      workspaceId,
      userId: currentUserId,
      taskId: selectedTask.id,
      projectId: selectedTask.projectIds[0],
      startedAt: new Date().toISOString(),
      description: description.trim() || selectedTask.name,
      billable,
    }
    start(timer)
    onOpenChange?.(false)
    setSelectedTaskId('')
    setDescription('')
  }

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          {running ? (
            <Button variant="secondary" size="sm" className="gap-1 font-mono tabular-nums bg-primary-soft" aria-live="polite">
              ▶ {task?.name?.slice(0, 20) ?? 'Timer'} · {formatElapsed(elapsed)}
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Start timer">
              <Timer className="h-4 w-4" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          {running ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{task?.name ?? 'Running timer'}</p>
                <p className="font-mono text-lg tabular-nums">{formatElapsed(elapsed)}</p>
              </div>
              <Input
                value={running.description}
                onChange={(event) => useTimerStore.getState().updateDescription(running.userId, event.target.value)}
                aria-label="Running timer description"
              />
              {task && workspaceId ? <Link className="block text-xs underline" href={`/dashboard/project-management/w/${workspaceId}/tasks/${task.id}`}>View task</Link> : null}
              <div className="flex gap-2">
                <Button size="sm" className=" flex-1 border-0" onClick={() => setTransitionOpen(true)}>Stop</Button>
                <Button size="sm" variant="outline" onClick={() => discard(running.userId)}>Discard</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium">Quick start timer</p>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger><SelectValue placeholder="What are you working on?" /></SelectTrigger>
                <SelectContent className="z-[120]">
                  {tasks.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
              <label className="flex items-center justify-between text-sm"><span>Billable</span><Switch checked={billable} onCheckedChange={(checked) => setBillable(Boolean(checked))} /></label>
              <Button className=" w-full border-0" disabled={!selectedTask} onClick={quickStart}><Play className="mr-1 h-4 w-4" /> Start</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {running ? <TimerTransitionDialog open={transitionOpen} onOpenChange={setTransitionOpen} running={running} /> : null}
    </>
  )
}
