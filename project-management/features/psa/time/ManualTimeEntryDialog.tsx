'use client'

/** Manual time entry dialog with rate resolution and UTBMS codes. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import {
  useBillingRatesStore,
  useRateCardsStore,
  useTimeEntriesStore,
} from '../../../stores/entities'
import { buildTimeEntry } from '../../../lib/psa/createTimeEntry'
import { parseDurationInput, formatHoursHMM } from '../../../lib/psa/timeEntryUtils'
import { UTBMS_ACTIVITY_CODES } from '../../../lib/psa/constants'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { usePsaContext } from '../hooks/usePsaContext'
import { runPsaAction } from '../../../lib/psa/actions'
import type { Task, TimeEntry } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  userId: string
  task?: Task
  projectId?: string
  matterId?: string
  clientId?: string
  defaultHours?: number
  defaultDescription?: string
  entry?: TimeEntry
}

export function ManualTimeEntryDialog(props: Props) {
  const add = useTimeEntriesStore((s) => s.add)
  const billingRates = useBillingRatesStore((s) => s.list())
  const rateCards = useRateCardsStore((s) => s.list())
  const pid = props.projectId ?? props.task?.projectIds[0]
  const ctx = usePsaContext(props.workspaceId, props.userId, pid, props.matterId, props.clientId)
  const initialHours = props.entry?.hours ?? props.defaultHours ?? 1
  const [description, setDescription] = useState(props.entry?.description ?? props.defaultDescription ?? '')
  const [duration, setDuration] = useState(formatHoursHMM(initialHours))
  const [decimalHours, setDecimalHours] = useState(String(initialHours))
  const [date, setDate] = useState(props.entry?.date ?? new Date().toISOString().slice(0, 10))
  const [billable, setBillable] = useState(props.entry?.billable ?? true)
  const [activityCode, setActivityCode] = useState(props.entry?.activityCode ?? '')
  const [rateOverride, setRateOverride] = useState(props.entry?.rateSource === 'override' ? String(props.entry.rateSnapshot ?? '') : '')
  const [loading, setLoading] = useState(false)

  const syncDuration = (raw: string, from: 'hmm' | 'dec') => {
    const hours = parseDurationInput(raw)
    if (hours == null) return
    if (from === 'hmm') {
      setDuration(raw)
      setDecimalHours(String(Math.round(hours * 100) / 100))
    } else {
      setDecimalHours(raw)
      setDuration(formatHoursHMM(hours))
    }
  }

  const submit = async () => {
    const hours = parseDurationInput(decimalHours) ?? parseDurationInput(duration)
    if (!description.trim() || !hours || hours <= 0) return
    setLoading(true)
    try {
      const entry = buildTimeEntry({
        workspaceId: props.workspaceId,
        userId: props.userId,
        user: ctx.user,
        workspace: ctx.workspace,
        date,
        hours,
        description: description.trim(),
        billable,
        taskId: props.task?.id,
        projectId: pid,
        matterId: props.matterId ?? ctx.matter?.id,
        clientId: props.clientId ?? ctx.resolvedClientId,
        activityCode: activityCode || undefined,
        rateOverride: rateOverride ? parseFloat(rateOverride) : undefined,
        matter: ctx.matter,
        project: ctx.project,
        billingRates,
        rateCards,
      })
      if (props.entry) {
        await runPsaAction('timeEntries', props.entry.id, 'edit', props.workspaceId, { patch: {
          description: entry.description, date: entry.date, hours: entry.hours,
          durationMinutes: entry.durationMinutes, billable: entry.billable,
          activityCode: entry.activityCode, rateSnapshot: entry.rateSnapshot,
          rateSource: entry.rateSource, amount: entry.amount,
        } })
      } else await add(entry)
      props.onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const previewRate = rateOverride ? parseFloat(rateOverride) || 0 : ctx.rate.hourlyRate
  const previewAmt = billable ? (parseFloat(decimalHours) || 0) * previewRate : 0

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-sans text-xl">{props.entry ? 'Edit time' : 'Add time'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tl-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>Duration (h:mm)</Label><Input value={duration} onChange={(e) => syncDuration(e.target.value, 'hmm')} className="tl-input font-mono tabular-nums" /></div>
            <div className="grid gap-1"><Label>Decimal hours</Label><Input value={decimalHours} onChange={(e) => syncDuration(e.target.value, 'dec')} className="tl-input font-mono tabular-nums" /></div>
          </div>
          <div className="grid gap-1"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="tl-input" /></div>
          <Select value={activityCode || '__none'} onValueChange={(v) => setActivityCode(v === '__none' ? '' : v)}>
            <SelectTrigger className="tl-input"><SelectValue placeholder="Activity code" /></SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="__none">No code</SelectItem>
              {UTBMS_ACTIVITY_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex justify-between text-sm"><span style={{ color: 'hsl(var(--foreground-muted))' }}>{ctx.rate.label}</span><span className="font-mono tabular-nums">{formatMoney(previewRate, ctx.rate.currency)}/hr</span></div>
          <Input placeholder="Rate override (optional)" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} className="tl-input font-mono tabular-nums" />
          <div className="flex items-center gap-2"><Switch checked={billable} onCheckedChange={setBillable} /><Label>Billable</Label><span className="ml-auto font-mono tabular-nums text-sm">{formatMoney(previewAmt)}</span></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
