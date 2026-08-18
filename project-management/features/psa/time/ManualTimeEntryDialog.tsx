'use client'

/** Manual time entry dialog with rate resolution and UTBMS codes. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DialogContent, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  const pid = props.projectId ?? props.task?.projectIds[0] ?? props.entry?.projectId
  const matterId = props.matterId ?? props.entry?.matterId
  const clientId = props.clientId ?? props.entry?.clientId
  const initialHours = props.entry?.hours ?? props.defaultHours ?? 1
  const [description, setDescription] = useState(props.entry?.description ?? props.defaultDescription ?? '')
  const [duration, setDuration] = useState(formatHoursHMM(initialHours))
  const [decimalHours, setDecimalHours] = useState(String(initialHours))
  const [date, setDate] = useState(props.entry?.date ?? new Date().toISOString().slice(0, 10))
  const ctx = usePsaContext(props.workspaceId, props.userId, pid, matterId, clientId, date)
  const [billable, setBillable] = useState(props.entry?.billable ?? true)
  const [activityCode, setActivityCode] = useState(props.entry?.activityCode ?? '')
  const [rateOverride, setRateOverride] = useState(props.entry?.rateSource === 'override' ? String(props.entry.rateSnapshot ?? '') : '')
  const [rateOverrideReason, setRateOverrideReason] = useState(props.entry?.rateOverrideReason ?? '')
  const [loading, setLoading] = useState(false)

  const rawRateOverride = rateOverride.trim() === '' ? undefined : Number(rateOverride)
  const parsedRateOverride = rawRateOverride !== undefined && Number.isFinite(rawRateOverride) && rawRateOverride >= 0
    ? rawRateOverride
    : undefined
  const invalidRateOverride = rateOverride.trim() !== '' && parsedRateOverride === undefined
  const previewRate = parsedRateOverride ?? ctx.rate.hourlyRate
  const requiresZeroRateReason = billable && parsedRateOverride === 0

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
    if (!description.trim() || !hours || hours <= 0 || invalidRateOverride || (requiresZeroRateReason && !rateOverrideReason.trim())) return
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
        matterId: ctx.resolvedMatterId,
        clientId: ctx.resolvedClientId,
        activityCode: activityCode || undefined,
        rateOverride: parsedRateOverride,
        rateOverrideReason: requiresZeroRateReason ? rateOverrideReason : undefined,
        client: ctx.client,
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
          rateSource: entry.rateSource, rateOverrideReason: entry.rateOverrideReason,
          amount: entry.amount, matterId: entry.matterId, projectId: entry.projectId,
          clientId: entry.clientId,
        } })
      } else await add(entry)
      props.onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const previewAmt = billable ? (parseFloat(decimalHours) || 0) * previewRate : 0

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-sans text-xl">{props.entry ? 'Edit time' : 'Add time'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>Duration (h:mm)</Label><Input value={duration} onChange={(e) => syncDuration(e.target.value, 'hmm')} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" /></div>
            <div className="grid gap-1"><Label>Decimal hours</Label><Input value={decimalHours} onChange={(e) => syncDuration(e.target.value, 'dec')} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" /></div>
          </div>
          <div className="grid gap-1"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <Select value={activityCode || '__none'} onValueChange={(v) => setActivityCode(v === '__none' ? '' : v)}>
            <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Activity code" /></SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="__none">No code</SelectItem>
              {UTBMS_ACTIVITY_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex justify-between text-sm"><span style={{ color: 'hsl(var(--foreground-muted))' }}>{ctx.rate.label}</span><span className="font-mono tabular-nums">{formatMoney(previewRate, ctx.rate.currency)}/hr</span></div>
          <Input placeholder="Rate override (optional)" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" />
          {invalidRateOverride && <p className="text-sm text-destructive">Enter a non-negative rate.</p>}
          {requiresZeroRateReason && (
            <div className="grid gap-1">
              <Label htmlFor="zero-rate-reason">Zero-rate reason</Label>
              <Input id="zero-rate-reason" value={rateOverrideReason} onChange={(e) => setRateOverrideReason(e.target.value)} placeholder="Explain why this time has no charge" />
            </div>
          )}
          <div className="flex items-center gap-2"><Switch checked={billable} onCheckedChange={setBillable} /><Label>Billable</Label><span className="ml-auto font-mono tabular-nums text-sm">{formatMoney(previewAmt)}</span></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading || invalidRateOverride || (requiresZeroRateReason && !rateOverrideReason.trim())} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
