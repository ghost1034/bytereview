'use client'

/** Approver inbox for submitted timesheets. */
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { runPsaAction, type PsaLifecycleAction, type PsaLifecycleKind } from '../../../lib/psa/actions'
import {
  useTimeEntriesStore,
  useTimesheetsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../../stores/entities'
import type { Timesheet } from '../../../types'
import {
  formatApprovalError,
  getTimeApprovalEligibility,
  runApprovalOnce,
} from './timeApproval'

type Props = { workspaceId: string; approverId: string }

type ApprovalActionOptions = {
  kind: PsaLifecycleKind
  recordId: string
  action: PsaLifecycleAction
  payload?: Record<string, unknown>
  successTitle: string
  onSuccess?: () => void
}

export function TimeApprovalsTab({ workspaceId, approverId }: Props) {
  const sheets = useTimesheetsStore((s) => s.list().filter((sheet) => sheet.workspaceId === workspaceId && sheet.status === 'submitted'))
  const entries = useTimeEntriesStore((s) => s.list())
  const standaloneEntries = entries.filter((entry) => entry.workspaceId === workspaceId && entry.status === 'submitted' && !entry.timesheetId)
  const users = useUsersStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const { toast } = useToast()
  const [rejectReason, setRejectReason] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const inFlight = useRef(new Set<string>())

  const performAction = async ({
    kind,
    recordId,
    action,
    payload = {},
    successTitle,
    onSuccess,
  }: ApprovalActionOptions) => {
    await runApprovalOnce(inFlight.current, async () => {
      const key = `${kind}:${recordId}`
      setPendingKey(key)
      try {
        await runPsaAction(kind, recordId, action, workspaceId, payload)
        onSuccess?.()
        toast({ title: successTitle, description: 'The refreshed approval status is now shown.' })
      } catch (error) {
        toast({
          title: 'Approval action failed',
          description: formatApprovalError(error),
          variant: 'destructive',
        })
      } finally {
        setPendingKey(null)
      }
    })
  }

  const approve = async (sheet: Timesheet) => {
    await performAction({
      kind: 'timesheets',
      recordId: sheet.id,
      action: 'approve',
      successTitle: 'Timesheet approved',
    })
  }

  const reject = async (sheet: Timesheet) => {
    if (!rejectReason.trim()) return
    await performAction({
      kind: 'timesheets',
      recordId: sheet.id,
      action: 'reject',
      payload: { reason: rejectReason },
      successTitle: 'Timesheet rejected',
      onSuccess: () => {
        setRejectId(null)
        setRejectReason('')
        setApprovedIds(new Set())
      },
    })
  }

  const approveStandalone = async (entryId: string) => {
    await performAction({
      kind: 'timeEntries',
      recordId: entryId,
      action: 'approve',
      successTitle: 'Time entry approved',
    })
  }

  const rejectStandalone = async (entryId: string) => {
    const reason = window.prompt('Rejection reason')?.trim()
    if (!reason) return
    await performAction({
      kind: 'timeEntries',
      recordId: entryId,
      action: 'reject',
      payload: { reason },
      successTitle: 'Time entry rejected',
    })
  }

  if (sheets.length === 0 && standaloneEntries.length === 0) {
    return <p className="py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No timesheets awaiting approval.</p>
  }

  const anyPending = pendingKey !== null

  return (
    <div className="space-y-3">
      {standaloneEntries.map((entry) => {
        const eligibility = getTimeApprovalEligibility(entry.userId, approverId, workspace)
        const entryPending = pendingKey === `timeEntries:${entry.id}`
        return (
          <div key={entry.id} className="rounded-lg border border-border bg-card text-card-foreground flex items-center justify-between gap-3 p-4 shadow-sm">
            <div>
              <p className="font-medium">{entry.description}</p>
              <p className="font-mono text-sm">{entry.hours.toFixed(2)}h · {formatMoney(entry.amount ?? 0)}</p>
              {!eligibility.eligible && <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{eligibility.reason}</p>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={anyPending || !eligibility.eligible}
                title={eligibility.reason}
                onClick={() => void approveStandalone(entry.id)}
              >
                {entryPending ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={anyPending || !eligibility.eligible}
                title={eligibility.reason}
                onClick={() => void rejectStandalone(entry.id)}
              >
                Reject
              </Button>
            </div>
          </div>
        )
      })}
      {sheets.map((sheet) => {
        const user = users.find((candidate) => candidate.id === sheet.userId)
        const sheetEntries = entries.filter((entry) => entry.timesheetId === sheet.id)
        const eligibility = getTimeApprovalEligibility(sheet.userId, approverId, workspace)
        const sheetPending = pendingKey === `timesheets:${sheet.id}`
        return (
          <div key={sheet.id} className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{user?.name ?? 'User'}</p>
                <p className="text-sm font-mono tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>{sheet.periodStart} — {sheet.periodEnd}</p>
                <p className="text-sm font-mono tabular-nums">{sheet.totalHours.toFixed(2)}h · {formatMoney(sheet.totalAmount)}</p>
                {!eligibility.eligible && <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{eligibility.reason}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="border-0"
                  disabled={anyPending || !eligibility.eligible}
                  title={eligibility.reason}
                  onClick={() => void approve(sheet)}
                >
                  {sheetPending ? 'Approving…' : 'Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={anyPending || !eligibility.eligible}
                  title={eligibility.reason}
                  onClick={() => setRejectId(sheet.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-1 border-t pt-3">
              {sheetEntries.map((entry) => (
                <label key={entry.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={anyPending || !eligibility.eligible}
                    checked={approvedIds.has(entry.id)}
                    onChange={() => setApprovedIds((old) => {
                      const next = new Set(old)
                      if (next.has(entry.id)) next.delete(entry.id)
                      else next.add(entry.id)
                      return next
                    })}
                  />
                  <span>{entry.description}</span>
                  <span className="ml-auto font-mono">{entry.hours.toFixed(2)}h</span>
                </label>
              ))}
            </div>
            {rejectId === sheet.id && eligibility.eligible && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  placeholder="Rejection reason"
                  value={rejectReason}
                  disabled={anyPending}
                  onChange={(event) => setRejectReason(event.target.value)}
                  className="rounded-md border border-input bg-background text-foreground"
                />
                <Button size="sm" variant="destructive" disabled={anyPending || !rejectReason.trim()} onClick={() => void reject(sheet)}>
                  {sheetPending ? 'Saving…' : 'Confirm'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={anyPending || !rejectReason.trim() || approvedIds.size === 0 || approvedIds.size === sheetEntries.length}
                  onClick={() => void performAction({
                    kind: 'timesheets',
                    recordId: sheet.id,
                    action: 'partial-approve',
                    payload: {
                      approvedIds: [...approvedIds],
                      rejectedIds: sheetEntries.map((entry) => entry.id).filter((id) => !approvedIds.has(id)),
                      reason: rejectReason,
                    },
                    successTitle: 'Timesheet partially approved',
                    onSuccess: () => {
                      setRejectId(null)
                      setRejectReason('')
                      setApprovedIds(new Set())
                    },
                  })}
                >
                  {sheetPending ? 'Saving…' : 'Approve selected'}
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
