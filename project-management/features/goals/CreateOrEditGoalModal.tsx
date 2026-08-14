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
        rollupWeight: Math.max(0.01, Number(form.rollupWeight) || 1),
        supportingGoalWeights: form.supportingGoalWeights,
        supportingProjectWeights: form.supportingProjectWeights,
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">{goal ? 'Edit goal' : 'Create goal'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <GoalFormField label="Name *"><Input className="rounded-md border border-input bg-background text-foreground" value={form.name} onChange={(e) => form.setName(e.target.value)} /></GoalFormField>
          <GoalFormField label="Description"><Input className="rounded-md border border-input bg-background text-foreground" value={form.description} onChange={(e) => form.setDescription(e.target.value)} /></GoalFormField>
          <div className="grid grid-cols-2 gap-3">
            <GoalFormField label="Owner">
              <Select value={form.ownerId} onValueChange={form.setOwnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </GoalFormField>
            <GoalFormField label="Privacy">
              <Select value={form.privacy} onValueChange={(v) => form.setPrivacy(v as Goal['privacy'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="members_only">Members only</SelectItem>
                </SelectContent>
              </Select>
            </GoalFormField>
          </div>
          <GoalFormField label="Time period">
            <Select value={form.preset} onValueChange={(v) => form.applyPreset(v as TimeFramePreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                {(Object.keys(TIMEFRAME_PRESET_LABELS) as TimeFramePreset[]).map((k) => (
                  <SelectItem key={k} value={k}>{TIMEFRAME_PRESET_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input type="date" className="rounded-md border border-input bg-background text-foreground" value={form.start} onChange={(e) => { form.setStart(e.target.value); form.setPreset('custom') }} />
              <Input type="date" className="rounded-md border border-input bg-background text-foreground" value={form.end} onChange={(e) => { form.setEnd(e.target.value); form.setPreset('custom') }} />
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
              <SelectContent className="z-[100]">
                <SelectItem value="none">None (company root)</SelectItem>
                {parentOptions.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </GoalFormField>
          {form.parentGoalId !== 'none' ? <GoalFormField label="Rollup weight in parent"><Input aria-label="Goal rollup weight" type="number" min="0.01" step="0.25" value={form.rollupWeight} onChange={(event) => form.setRollupWeight(event.target.value)} /></GoalFormField> : null}
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
          {form.subGoalIds.length ? <GoalFormField label="Supporting goal weights"><div className="space-y-2">{form.subGoalIds.map((id) => <label key={id} className="grid grid-cols-[1fr_100px] items-center gap-2 text-sm"><span>{goals.find((item) => item.id === id)?.name ?? id}</span><Input aria-label={`Weight for goal ${id}`} type="number" min="0.01" step="0.25" value={form.supportingGoalWeights[id] ?? 1} onChange={(event) => form.setSupportingGoalWeights((weights) => ({ ...weights, [id]: Math.max(0.01, Number(event.target.value) || 1) }))} /></label>)}</div></GoalFormField> : null}
          {form.projectIds.length ? <GoalFormField label="Supporting project weights"><div className="space-y-2">{form.projectIds.map((id) => <label key={id} className="grid grid-cols-[1fr_100px] items-center gap-2 text-sm"><span>{projects.find((item) => item.id === id)?.name ?? id}</span><Input aria-label={`Weight for project ${id}`} type="number" min="0.01" step="0.25" value={form.supportingProjectWeights[id] ?? 1} onChange={(event) => form.setSupportingProjectWeights((weights) => ({ ...weights, [id]: Math.max(0.01, Number(event.target.value) || 1) }))} /></label>)}</div></GoalFormField> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading || !form.name.trim()} onClick={() => void submit()}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
