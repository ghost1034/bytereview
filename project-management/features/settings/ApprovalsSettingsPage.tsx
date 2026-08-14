'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useState } from 'react'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore, useWorkspacesStore } from '../../stores/entities'
import { canPerformWorkspaceAction } from '../../lib/permissions'

export function ApprovalsSettingsPage() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => userId ? s.getById(userId) : undefined)
  const members = useUsersStore((s) => s.list().filter((candidate) => workspace?.memberIds.includes(candidate.id)))
  const updateUser = useUsersStore((s) => s.update)
  const update = useWorkspacesStore((s) => s.update)
  const [timeRequired, setTimeRequired] = useState(workspace?.requireTimeApproval ?? true)
  const [expenseRequired, setExpenseRequired] = useState(workspace?.requireExpenseApproval ?? true)
  const [receiptThreshold, setReceiptThreshold] = useState(String(workspace?.expenseReceiptRequiredAbove ?? 25))
  const [selfApproval, setSelfApproval] = useState(workspace?.approvalSettings?.allowSelfApproval ?? false)
  const defaultApprovers = members.filter((member) => workspace?.adminIds.includes(member.id) || member.roleFlags?.canApprove).map((member) => member.id)
  const [timeApproverIds, setTimeApproverIds] = useState(workspace?.approvalSettings?.timeApproverIds ?? defaultApprovers)
  const [expenseApproverIds, setExpenseApproverIds] = useState(workspace?.approvalSettings?.expenseApproverIds ?? defaultApprovers)
  const editable = canPerformWorkspaceAction(user, workspace, 'workspace-administration')
  usePageMeta({ breadcrumbs: [{ label: 'Settings' }, { label: 'Approvals' }] })
  if (!workspaceId || !workspace) return null

  const toggleApprover = (ids: string[], setIds: (next: string[]) => void, id: string) => setIds(ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id])
  const save = async () => {
    const routedTimeApprovers = [...new Set([...timeApproverIds, ...workspace.adminIds])]
    const routedExpenseApprovers = [...new Set([...expenseApproverIds, ...workspace.adminIds])]
    await update(workspaceId, {
      requireTimeApproval: timeRequired,
      requireExpenseApproval: expenseRequired,
      expenseReceiptRequiredAbove: Math.max(0, Number(receiptThreshold) || 0),
      approvalSettings: { ...workspace.approvalSettings, allowSelfApproval: selfApproval, timeApproverIds: routedTimeApprovers, expenseApproverIds: routedExpenseApprovers },
    })
    const approverIds = new Set([...routedTimeApprovers, ...routedExpenseApprovers])
    await Promise.all(members.filter((member) => !workspace.adminIds.includes(member.id)).map((member) => updateUser(member.id, {
      roleFlags: { ...member.roleFlags, canApprove: approverIds.has(member.id) },
    })))
  }

  return <div className="space-y-5">
    <div><h1 className="font-sans text-2xl">Approvals</h1><p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>One policy surface for time, timesheets, expenses, and reimbursements.</p></div>
    <div className="tl-card max-w-2xl space-y-4 p-5 shadow-sm">
      <label className="flex items-center justify-between gap-4 text-sm"><span><b>Time approval</b><br /><span style={{ color: 'hsl(var(--foreground-muted))' }}>Require submitted time and timesheets to be approved.</span></span><Switch checked={timeRequired} disabled={!editable} onCheckedChange={setTimeRequired} /></label>
      <label className="flex items-center justify-between gap-4 text-sm"><span><b>Expense approval</b><br /><span style={{ color: 'hsl(var(--foreground-muted))' }}>Require reports before reimbursement or client billing.</span></span><Switch checked={expenseRequired} disabled={!editable} onCheckedChange={setExpenseRequired} /></label>
      <label className="grid gap-1 text-sm"><span>Receipt required above</span><Input className="tl-input max-w-40 font-mono" type="number" min="0" disabled={!editable} value={receiptThreshold} onChange={(e) => setReceiptThreshold(e.target.value)} /></label>
      <label className="flex items-center justify-between gap-4 text-sm"><span>Allow self-approval</span><Switch checked={selfApproval} disabled={!editable} onCheckedChange={setSelfApproval} /></label>
      <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Approval routing</p><div className="grid grid-cols-[1fr_auto_auto] gap-x-5 gap-y-2 text-sm"><span /><span>Time</span><span>Expense</span>{members.map((member) => <div className="contents" key={member.id}><span>{member.name}{workspace.adminIds.includes(member.id) ? ' (admin)' : ''}</span><input aria-label={`${member.name} time approver`} type="checkbox" disabled={!editable || workspace.adminIds.includes(member.id)} checked={workspace.adminIds.includes(member.id) || timeApproverIds.includes(member.id)} onChange={() => toggleApprover(timeApproverIds, setTimeApproverIds, member.id)} /><input aria-label={`${member.name} expense approver`} type="checkbox" disabled={!editable || workspace.adminIds.includes(member.id)} checked={workspace.adminIds.includes(member.id) || expenseApproverIds.includes(member.id)} onChange={() => toggleApprover(expenseApproverIds, setExpenseApproverIds, member.id)} /></div>)}</div></div>
      <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>Approval buttons are additionally restricted by each member’s Approve capability. Lock, write-off, and reimbursement require Billing capability.</p>
      {editable && <Button className="tl-btn-primary border-0" onClick={() => void save()}>Save approval settings</Button>}
    </div>
  </div>
}
