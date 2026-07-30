'use client'

/** Form state initializer for create/edit goal modal. */
import { useEffect, useState } from 'react'
import { resolveTimeFramePreset, type TimeFramePreset } from '../../lib/goals/timeFrames'
import type { Goal } from '../../types'
import type { MetricKind } from './GoalMetricFields'

/** Manage create/edit goal form fields. */
export function useGoalFormState(open: boolean, goal: Goal | undefined, currentUserId: string | null) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [parentGoalId, setParentGoalId] = useState<string>('none')
  const [preset, setPreset] = useState<TimeFramePreset>('Q1')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [privacy, setPrivacy] = useState<Goal['privacy']>('public')
  const [metricKind, setMetricKind] = useState<MetricKind>('percent')
  const [current, setCurrent] = useState('0')
  const [target, setTarget] = useState('100')
  const [unit, setUnit] = useState('')
  const [symbol, setSymbol] = useState('$')
  const [manualStatus, setManualStatus] = useState<'on_track' | 'at_risk' | 'off_track'>('on_track')
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [subGoalIds, setSubGoalIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    if (goal) {
      setName(goal.name)
      setDescription(goal.description ?? '')
      setOwnerId(goal.ownerId)
      setParentGoalId(goal.parentGoalId ?? 'none')
      setStart(goal.timeFrame.start)
      setEnd(goal.timeFrame.end)
      setPreset('custom')
      setPrivacy(goal.privacy)
      setProjectIds(goal.supportingProjectIds)
      setSubGoalIds(goal.supportingGoalIds)
      if (goal.metric.type === 'manual') {
        setMetricKind('manual')
        setManualStatus(goal.metric.status)
      } else if (goal.metric.type === 'currency') {
        setMetricKind('currency')
        setCurrent(String(goal.metric.current))
        setTarget(String(goal.metric.target))
        setSymbol(goal.metric.symbol)
      } else if (goal.metric.type === 'numeric') {
        setMetricKind('numeric')
        setCurrent(String(goal.metric.current))
        setTarget(String(goal.metric.target))
        setUnit(goal.metric.unit ?? '')
      } else {
        setMetricKind('percent')
        setCurrent(String(goal.metric.current))
      }
    } else {
      setOwnerId(currentUserId ?? '')
      const range = resolveTimeFramePreset('Q1')
      setStart(range.start)
      setEnd(range.end)
    }
  }, [open, goal, currentUserId])

  const applyPreset = (p: TimeFramePreset) => {
    setPreset(p)
    if (p !== 'custom') {
      const range = resolveTimeFramePreset(p)
      setStart(range.start)
      setEnd(range.end)
    }
  }

  const buildMetric = (): Goal['metric'] => {
    if (metricKind === 'manual') return { type: 'manual', status: manualStatus }
    if (metricKind === 'currency') {
      return { type: 'currency', current: Number(current) || 0, target: Number(target) || 1, symbol }
    }
    if (metricKind === 'numeric') {
      return { type: 'numeric', current: Number(current) || 0, target: Number(target) || 1, unit: unit || undefined }
    }
    return { type: 'percent', current: Number(current) || 0, target: 100 }
  }

  return {
    name, setName, description, setDescription, ownerId, setOwnerId,
    parentGoalId, setParentGoalId, preset, applyPreset, start, setStart, end, setEnd, setPreset,
    privacy, setPrivacy, metricKind, setMetricKind, current, setCurrent, target, setTarget,
    unit, setUnit, symbol, setSymbol, manualStatus, setManualStatus,
    projectIds, setProjectIds, subGoalIds, setSubGoalIds, buildMetric,
  }
}
