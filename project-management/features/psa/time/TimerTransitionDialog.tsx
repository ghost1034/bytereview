'use client'

/** Save / Discard / Cancel confirmation used for stops and task switches. */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { saveRunningTimer } from '../../../lib/psa/runningTimer'
import { useTimerStore, type RunningTimer } from '../../../stores/timerStore'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  running: RunningTimer
  nextTimer?: RunningTimer
}

export function TimerTransitionDialog({ open, onOpenChange, running, nextTimer }: Props) {
  const [description, setDescription] = useState(running.description)
  const [saving, setSaving] = useState(false)
  const stop = useTimerStore((state) => state.stop)
  const discard = useTimerStore((state) => state.discard)
  const start = useTimerStore((state) => state.start)

  useEffect(() => setDescription(running.description), [running.description, running.taskId])

  const complete = () => {
    if (nextTimer) start({ ...nextTimer, startedAt: new Date().toISOString() })
    onOpenChange(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveRunningTimer({ ...running, description })
      stop(running.userId)
      complete()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{nextTimer ? 'Switch running timer?' : 'Stop running timer?'}</DialogTitle>
          <DialogDescription>
            {nextTimer ? 'Save or discard the current timer before starting the next task.' : 'Save the elapsed time or discard this timer.'}
          </DialogDescription>
        </DialogHeader>
        <Input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Timer description" />
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={saving} onClick={() => { discard(running.userId); complete() }}>Discard</Button>
          <Button className="tl-btn-primary border-0" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
