'use client'

/** Create or edit goal modal — full OKR form. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createGoal, updateGoal } from '../../lib/goals/goalActions'
import { TIMEFRAME_PRESET_LABELS, type TimeFramePreset } from '../../lib/goals/timeFrames'
import { useAuthStore } from '../../stores/auth'
import { useGoalsStore, useProjectsStore, useUsersStore } from '../../stores/entities'
import type { Goal } from '../../types'
import { GoalFormField, GoalMultiCheck, toggleSelectedId } from './GoalFormFields'
import { GoalMetricFields } from './GoalMetricFields'
import { useGoalFormState } from './useGoalFormState'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  goal?: Goal
}

/** Modal for creating or editing a goal with hierarchy and supporting work. */
export function CreateOrEditGoalModal({ open, onOpenChange, workspaceId, goal }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const goals = useGoalsStore((s) => s.list().filter((g) => g.workspaceId === workspaceId))
  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const form = useGoalFormState(open, goal, currentUserId)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!form.name.trim() || !form.ownerId) return
    setLoading(true)
    try {
      const payload = {
        workspaceId,
        name: form.name,
        description: form.description,
        ownerId: form.ownerId,
        parentGoalId: form.parentGoalId === 'none' ? undefined : form.parentGoalId,
        timeFrame: { start: form.start, end: form.end },
        metric: form.buildMetric(),
        privacy: form.privacy,
        supportingProjectIds: form.projectIds,
        supportingGoalIds: form.subGoalIds,
      }
      if (goal) await updateGoal(goal.id, payload)
      else await createGoal(payload)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const parentOptions = goals.filter((g) => g.id !== goal?.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{goal ? 'Edit goal' : 'Create goal'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <GoalFormField label="Name *"><Input className="tl-input" value={form.name} onChange={(e) => form.setName(e.target.value)} /></GoalFormField>
          <GoalFormField label="Description"><Input className="tl-input" value={form.description} onChange={(e) => form.setDescription(e.target.value)} /></GoalFormField>
          <div className="grid grid-cols-2 gap-3">
            <GoalFormField label="Owner">
              <Select value={form.ownerId} onValueChange={form.setOwnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="tl-popover-surface z-[100]">{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </GoalFormField>
            <GoalFormField label="Privacy">
              <Select value={form.privacy} onValueChange={(v) => form.setPrivacy(v as Goal['privacy'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="tl-popover-surface z-[100]">
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="members_only">Members only</SelectItem>
                </SelectContent>
              </Select>
            </GoalFormField>
          </div>
          <GoalFormField label="Time period">
            <Select value={form.preset} onValueChange={(v) => form.applyPreset(v as TimeFramePreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                {(Object.keys(TIMEFRAME_PRESET_LABELS) as TimeFramePreset[]).map((k) => (
                  <SelectItem key={k} value={k}>{TIMEFRAME_PRESET_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input type="date" className="tl-input" value={form.start} onChange={(e) => { form.setStart(e.target.value); form.setPreset('custom') }} />
              <Input type="date" className="tl-input" value={form.end} onChange={(e) => { form.setEnd(e.target.value); form.setPreset('custom') }} />
            </div>
          </GoalFormField>
          <GoalMetricFields
            metricKind={form.metricKind}
            setMetricKind={form.setMetricKind}
            current={form.current}
            setCurrent={form.setCurrent}
            target={form.target}
            setTarget={form.setTarget}
            unit={form.unit}
            setUnit={form.setUnit}
            symbol={form.symbol}
            setSymbol={form.setSymbol}
            manualStatus={form.manualStatus}
            setManualStatus={form.setManualStatus}
          />
          <GoalFormField label="Parent goal">
            <Select value={form.parentGoalId} onValueChange={form.setParentGoalId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                <SelectItem value="none">None (company root)</SelectItem>
                {parentOptions.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </GoalFormField>
          {projects.length > 0 && (
            <GoalMultiCheck
              label="Supporting projects"
              items={projects.map((p) => ({ id: p.id, label: `${p.iconEmoji ?? '📁'} ${p.name}` }))}
              selected={form.projectIds}
              onToggle={(id) => form.setProjectIds(toggleSelectedId(form.projectIds, id))}
            />
          )}
          {parentOptions.length > 0 && (
            <GoalMultiCheck
              label="Supporting sub-goals"
              items={parentOptions.map((g) => ({ id: g.id, label: g.name }))}
              selected={form.subGoalIds}
              onToggle={(id) => form.setSubGoalIds(toggleSelectedId(form.subGoalIds, id))}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading || !form.name.trim()} onClick={() => void submit()}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
