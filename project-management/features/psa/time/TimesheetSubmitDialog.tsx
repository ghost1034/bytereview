'use client'

/** Submit timesheet for approval. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { entryHours } from '../../../lib/psa/timeEntryUtils'
import { utilizationPercent } from '../../../lib/billing/selectors'
import { useTimesheetsStore, useTimeEntriesStore } from '../../../stores/entities'
import type { TimeEntry, Timesheet } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  userId: string
  periodStart: string
  periodEnd: string
  entries: TimeEntry[]
  targetHours: number
}

export function TimesheetSubmitDialog(props: Props) {
  const addSheet = useTimesheetsStore((s) => s.add)
  const updateEntry = useTimeEntriesStore((s) => s.update)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const billable = props.entries.filter((e) => e.billable).reduce((s, e) => s + entryHours(e), 0)
  const total = props.entries.reduce((s, e) => s + entryHours(e), 0)
  const amount = props.entries.reduce((s, e) => s + (e.amount ?? 0), 0)

  const submit = async () => {
    setLoading(true)
    try {
      const sheet: Timesheet = {
        id: newId(),
        workspaceId: props.workspaceId,
        userId: props.userId,
        periodStart: props.periodStart,
        periodEnd: props.periodEnd,
        status: 'submitted',
        totalHours: total,
        billableHours: billable,
        nonBillableHours: total - billable,
        totalAmount: amount,
        utilizationPercent: utilizationPercent(billable, props.targetHours),
        targetHours: props.targetHours,
        submittedAt: now(),
        notes: notes || undefined,
      }
      await addSheet(sheet)
      await Promise.all(
        props.entries.map((e) =>
          updateEntry(e.id, { status: 'submitted', submittedAt: now(), timesheetId: sheet.id })
        )
      )
      props.onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <TasklyticDialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-serif text-xl">Submit timesheet</DialogTitle></DialogHeader>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>{props.periodStart} — {props.periodEnd}</p>
        <p className="font-mono tabular-nums text-sm">{total.toFixed(2)}h total · {billable.toFixed(2)}h billable</p>
        <div className="grid gap-1"><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="tl-input" /></div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading || props.entries.length === 0} onClick={() => void submit()}>Submit week</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
