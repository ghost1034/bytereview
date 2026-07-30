'use client'

/** Approver inbox for submitted timesheets. */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { now } from '../../../lib/time'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { useTimesheetsStore, useTimeEntriesStore, useUsersStore } from '../../../stores/entities'
import type { Timesheet } from '../../../types'

type Props = { workspaceId: string; approverId: string }

export function TimeApprovalsTab({ workspaceId, approverId }: Props) {
  const sheets = useTimesheetsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId && t.status === 'submitted'))
  const updateSheet = useTimesheetsStore((s) => s.update)
  const updateEntry = useTimeEntriesStore((s) => s.update)
  const users = useUsersStore((s) => s.list())
  const [rejectReason, setRejectReason] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)

  const approve = async (sheet: Timesheet) => {
    await updateSheet(sheet.id, { status: 'approved', approvedById: approverId, approvedAt: now() })
    const entries = useTimeEntriesStore.getState().list().filter((e) => e.timesheetId === sheet.id)
    await Promise.all(entries.map((e) => updateEntry(e.id, { status: 'approved', approved: true, approvedById: approverId, approvedAt: now() })))
  }

  const reject = async (sheet: Timesheet) => {
    if (!rejectReason.trim()) return
    await updateSheet(sheet.id, { status: 'rejected', rejectedReason: rejectReason, approvedById: approverId, approvedAt: now() })
    const entries = useTimeEntriesStore.getState().list().filter((e) => e.timesheetId === sheet.id)
    await Promise.all(entries.map((e) => updateEntry(e.id, { status: 'draft', rejectedReason: rejectReason })))
    setRejectId(null)
    setRejectReason('')
  }

  if (sheets.length === 0) {
    return <p className="py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>No timesheets awaiting approval.</p>
  }

  return (
    <div className="space-y-3">
      {sheets.map((sheet) => {
        const user = users.find((u) => u.id === sheet.userId)
        return (
          <div key={sheet.id} className="tl-card p-4 shadow-paper-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{user?.name ?? 'User'}</p>
                <p className="text-sm font-mono tabular-nums" style={{ color: 'var(--ink-muted)' }}>{sheet.periodStart} — {sheet.periodEnd}</p>
                <p className="text-sm font-mono tabular-nums">{sheet.totalHours.toFixed(2)}h · {formatMoney(sheet.totalAmount)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="tl-btn-primary border-0" onClick={() => void approve(sheet)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setRejectId(sheet.id)}>Reject</Button>
              </div>
            </div>
            {rejectId === sheet.id && (
              <div className="mt-3 flex gap-2">
                <Input placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="tl-input" />
                <Button size="sm" variant="destructive" onClick={() => void reject(sheet)}>Confirm</Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
