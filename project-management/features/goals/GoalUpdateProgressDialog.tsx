'use client'

/** Dialog to update goal metric progress with optional status post. */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateGoalProgress } from '../../lib/goals/goalActions'
import { getGoalProgressMode, setGoalProgressMode } from '../../lib/goals/goalMeta'
import type { Goal } from '../../types'

type Props = {
  goal: Goal
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Update current metric value or manual status; optional status update notification. */
export function GoalUpdateProgressDialog({ goal, currentUserId, open, onOpenChange }: Props) {
  const [autoMode, setAutoMode] = useState(getGoalProgressMode(goal.id) === 'auto')
  const [current, setCurrent] = useState('')
  const [manualStatus, setManualStatus] = useState<'on_track' | 'at_risk' | 'off_track'>('on_track')
  const [postUpdate, setPostUpdate] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setAutoMode(getGoalProgressMode(goal.id) === 'auto')
    if (goal.metric.type === 'manual') {
      setManualStatus(goal.metric.status)
    } else {
      setCurrent(String(goal.metric.current))
    }
  }, [open, goal])

  const submit = async () => {
    setLoading(true)
    try {
      setGoalProgressMode(goal.id, autoMode ? 'auto' : 'manual')
      let metric: Goal['metric'] = goal.metric
      if (goal.metric.type === 'manual') {
        metric = { type: 'manual', status: manualStatus }
      } else if (goal.metric.type === 'percent') {
        metric = { ...goal.metric, current: Number(current) || 0 }
      } else if (goal.metric.type === 'numeric' || goal.metric.type === 'currency') {
        metric = { ...goal.metric, current: Number(current) || 0 }
      }
      await updateGoalProgress({
        goalId: goal.id,
        actorId: currentUserId,
        metric,
        postUpdate,
        updateSummary: postUpdate ? `<p>Updated progress to ${current || manualStatus}.</p>` : undefined,
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans">Update progress</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-progress">Auto progress (rollup)</Label>
            <Switch id="auto-progress" checked={autoMode} onCheckedChange={setAutoMode} />
          </div>
          {goal.metric.type === 'manual' ? (
            <div className="flex gap-2">
              {(['on_track', 'at_risk', 'off_track'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={manualStatus === s ? 'default' : 'outline'}
                  onClick={() => setManualStatus(s)}
                >
                  {s.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="metric-current">
                Current {goal.metric.type === 'currency' ? `(${goal.metric.symbol})` : goal.metric.type === 'numeric' ? (goal.metric.unit ?? '') : '%'}
              </Label>
              <Input id="metric-current" type="number" className="tl-input" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="post-update" checked={postUpdate} onCheckedChange={setPostUpdate} />
            <Label htmlFor="post-update">Post a status update</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
