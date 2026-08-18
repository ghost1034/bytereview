'use client'

/** Full PSA time tracking page — week grid, entries, approvals. */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useTasksStore, useTimeEntriesStore, useTimesheetsStore, useWorkspacesStore } from '../../stores/entities'
import { buildTimeEntry } from '../../lib/psa/createTimeEntry'
import { entryHours, weekBounds } from '../../lib/psa/timeEntryUtils'
import { utilizationPercent } from '../../lib/billing/selectors'
import { formatMoney } from '../../lib/billing/formatMoney'
import { ManualTimeEntryDialog } from './time/ManualTimeEntryDialog'
import { TimesheetWeekGrid, TimesheetWeekNav } from './time/TimesheetWeekGrid'
import { TimesheetSubmitDialog } from './time/TimesheetSubmitDialog'
import { TimeApprovalsTab } from './time/TimeApprovalsTab'
import { TimeEntryRow } from './time/TimeEntryRow'
import { runPsaAction } from '../../lib/psa/actions'
import { resolveLinkedMatter } from '../../lib/psa/resolvePsaLinks'
import { canPerformWorkspaceAction } from '../../lib/permissions'
import type { TimeEntry } from '../../types'
import {
  useBillingRatesStore,
  useClientsStore,
  useMattersStore,
  useProjectsStore,
  useRateCardsStore,
  useUsersStore,
} from '../../stores/entities'

export function TimeTrackingPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const workspace = useWorkspacesStore((s) => (workspaceId ? s.getById(workspaceId) : undefined))
  const entries = useTimeEntriesStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const remove = useTimeEntriesStore((s) => s.remove)
  const add = useTimeEntriesStore((s) => s.add)
  const sheets = useTimesheetsStore((s) => s.list())
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  usePageMeta({ breadcrumbs: workspaceId ? [
    { label: 'Tasklytic', href: `/dashboard/project-management/w/${workspaceId}/home` },
    { label: 'Time tracking' },
  ] : [] })

  const weekStartPref = workspace?.timesheetWeekStart ?? 'monday'
  const bounds = weekBounds(weekAnchor, weekStartPref)
  const myEntries = useMemo(
    () => entries.filter((e) => e.workspaceId === workspaceId && e.userId === userId),
    [entries, workspaceId, userId]
  )
  const weekEntries = useMemo(
    () => myEntries.filter((e) => e.date >= bounds.start && e.date <= bounds.end),
    [myEntries, bounds]
  )
  const pendingSheet = sheets.find((s) => s.userId === userId && s.periodStart === bounds.start && s.status === 'submitted')
  const rejectedSheet = sheets.find((s) => s.userId === userId && s.periodStart === bounds.start && s.status === 'rejected')
  const readOnly = !!pendingSheet || !!rejectedSheet
  const targetHours = workspace?.targetWeeklyHours ?? 40
  const billableH = weekEntries.filter((e) => e.billable).reduce((s, e) => s + entryHours(e), 0)
  const totalH = weekEntries.reduce((s, e) => s + entryHours(e), 0)
  const filteredEntries = statusFilter === 'all' ? myEntries : myEntries.filter((entry) => (entry.status ?? 'draft') === statusFilter)
  const currentUser = useUsersStore((s) => userId ? s.getById(userId) : undefined)
  const canApprove = canPerformWorkspaceAction(currentUser, workspace, 'approve')
  const canBill = canPerformWorkspaceAction(currentUser, workspace, 'bill')

  const onCellSave = async (taskId: string | undefined, projectId: string | undefined, date: string, hours: number) => {
    if (!workspaceId || !userId || hours <= 0) return
    const user = useUsersStore.getState().getById(userId)
    const project = projectId ? useProjectsStore.getState().getById(projectId) : undefined
    const matter = resolveLinkedMatter(useMattersStore.getState().list(), project)
    const clientId = matter?.clientId ?? project?.clientId
    const client = clientId ? useClientsStore.getState().getById(clientId) : undefined
    const entry = buildTimeEntry({
      workspaceId,
      userId,
      user,
      workspace,
      date,
      hours,
      description: 'Timesheet entry',
      billable: true,
      taskId,
      projectId,
      matterId: matter?.id,
      clientId,
      client,
      matter,
      project,
      billingRates: useBillingRatesStore.getState().list(),
      rateCards: useRateCardsStore.getState().list(),
    })
    await add(entry)
  }

  if (!workspaceId || !userId) return null

  return (
    <div className="space-y-4" data-tour-page="time">
      {pendingSheet && <Badge className="w-full justify-center py-2">Timesheet submitted — awaiting approval</Badge>}
      {rejectedSheet && <Badge variant="destructive" className="w-full justify-center py-2">Rejected: {rejectedSheet.rejectedReason}</Badge>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sans text-2xl">My time</h1>
          <p className="text-sm font-mono tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {totalH.toFixed(2)}h · {billableH.toFixed(2)}h billable · {utilizationPercent(billableH, targetHours).toFixed(0)}% util
          </p>
        </div>
        <div className="flex gap-2">
          <Button className=" border-0" size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Log time</Button>
          <Button variant="outline" size="sm" disabled={readOnly || weekEntries.length === 0} onClick={() => setSubmitOpen(true)}>Submit week</Button>
        </div>
      </div>
      <Tabs defaultValue="week">
        <TabsList><TabsTrigger value="week">My week</TabsTrigger><TabsTrigger value="entries">All entries</TabsTrigger>{canApprove && <TabsTrigger value="approve">To approve</TabsTrigger>}</TabsList>
        <TabsContent value="week" className="space-y-3">
          <TimesheetWeekNav weekAnchor={weekAnchor} onChange={setWeekAnchor} />
          <TimesheetWeekGrid entries={weekEntries} tasks={tasks} weekAnchor={weekAnchor} weekStart={weekStartPref} readOnly={readOnly} onCellSave={onCellSave} />
          <div className="rounded-lg border border-border bg-card text-card-foreground p-3 text-sm shadow-sm">
            <p>Target: <span className="font-mono tabular-nums">{targetHours}h</span> · Gap: <span className="font-mono tabular-nums">{(targetHours - billableH).toFixed(2)}h</span></p>
            <p>Billable amount: <span className="font-mono tabular-nums">{formatMoney(weekEntries.reduce((s, e) => s + (e.amount ?? 0), 0))}</span></p>
          </div>
        </TabsContent>
        <TabsContent value="entries">
          <select aria-label="Filter time status" className="rounded-md border border-input bg-background text-foreground mb-3 w-48" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['draft', 'submitted', 'approved', 'rejected', 'written_off', 'billed'].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select>
          <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
              </tr></thead>
              <tbody>
                {filteredEntries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                  <TimeEntryRow key={e.id} entry={e}
                    onEdit={setEditing}
                    onSubmit={(id) => void runPsaAction('timeEntries', id, 'submit', workspaceId)}
                    onDuplicate={(entry) => void runPsaAction('timeEntries', entry.id, 'duplicate', workspaceId)}
                    onWriteOff={canBill ? (entry) => { const reason = window.prompt('Write-off reason'); if (reason) void runPsaAction('timeEntries', entry.id, 'write-off', workspaceId, { reason }) } : undefined}
                    onDelete={(id) => void remove(id)} />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        {canApprove && <TabsContent value="approve"><TimeApprovalsTab workspaceId={workspaceId} approverId={userId} /></TabsContent>}
      </Tabs>
      <ManualTimeEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={workspaceId} userId={userId} />
      {editing && <ManualTimeEntryDialog key={editing.id} open entry={editing} onOpenChange={(open) => { if (!open) setEditing(null) }} workspaceId={workspaceId} userId={userId} />}
      <TimesheetSubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} workspaceId={workspaceId} userId={userId} periodStart={bounds.start} periodEnd={bounds.end} entries={weekEntries} targetHours={targetHours} />
    </div>
  )
}
