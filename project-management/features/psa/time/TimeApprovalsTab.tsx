'use client'

/** Approver inbox for submitted timesheets. */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { useTimesheetsStore, useTimeEntriesStore, useUsersStore } from '../../../stores/entities'
import type { Timesheet } from '../../../types'
import { runPsaAction } from '../../../lib/psa/actions'

type Props = { workspaceId: string; approverId: string }

export function TimeApprovalsTab({ workspaceId }: Props) {
  const sheets = useTimesheetsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId && t.status === 'submitted'))
  const entries = useTimeEntriesStore((s) => s.list())
  const standaloneEntries = entries.filter((entry) => entry.workspaceId === workspaceId && entry.status === 'submitted' && !entry.timesheetId)
  const users = useUsersStore((s) => s.list())
  const [rejectReason, setRejectReason] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())

  const approve = async (sheet: Timesheet) => {
    await runPsaAction('timesheets', sheet.id, 'approve', workspaceId)
  }

  const reject = async (sheet: Timesheet) => {
    if (!rejectReason.trim()) return
    await runPsaAction('timesheets', sheet.id, 'reject', workspaceId, { reason: rejectReason })
    setRejectId(null)
    setRejectReason('')
  }

  if (sheets.length === 0 && standaloneEntries.length === 0) {
    return <p className="py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>No timesheets awaiting approval.</p>
  }

  return (
    <div className="space-y-3">
      {standaloneEntries.map((entry) => <div key={entry.id} className="tl-card flex items-center justify-between gap-3 p-4 shadow-paper-sm"><div><p className="font-medium">{entry.description}</p><p className="font-mono text-sm">{entry.hours.toFixed(2)}h · {formatMoney(entry.amount ?? 0)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => void runPsaAction('timeEntries', entry.id, 'approve', workspaceId)}>Approve</Button><Button size="sm" variant="outline" onClick={() => { const reason = window.prompt('Rejection reason'); if (reason) void runPsaAction('timeEntries', entry.id, 'reject', workspaceId, { reason }) }}>Reject</Button></div></div>)}
      {sheets.map((sheet) => {
        const user = users.find((u) => u.id === sheet.userId)
        const sheetEntries = entries.filter((entry) => entry.timesheetId === sheet.id)
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
            <div className="mt-3 space-y-1 border-t pt-3">{sheetEntries.map((entry) => <label key={entry.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approvedIds.has(entry.id)} onChange={() => setApprovedIds((old) => { const next = new Set(old); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next })} /><span>{entry.description}</span><span className="ml-auto font-mono">{entry.hours.toFixed(2)}h</span></label>)}</div>
            {rejectId === sheet.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Input placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="tl-input" />
                <Button size="sm" variant="destructive" onClick={() => void reject(sheet)}>Confirm</Button>
                <Button size="sm" variant="outline" disabled={!rejectReason.trim() || approvedIds.size === 0 || approvedIds.size === sheetEntries.length} onClick={() => void runPsaAction('timesheets', sheet.id, 'partial-approve', workspaceId, { approvedIds: [...approvedIds], rejectedIds: sheetEntries.map((entry) => entry.id).filter((id) => !approvedIds.has(id)), reason: rejectReason })}>Approve selected</Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
