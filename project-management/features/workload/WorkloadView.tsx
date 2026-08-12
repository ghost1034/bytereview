'use client'

/** Main workload heatmap grid with toolbar and interactions. */
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { updateTask } from '../../lib/taskActions'
import {
  defaultDueForBucket,
  exportWorkloadCsv,
  filterTasksForScope,
  type TimeScale,
  type WorkloadPreset,
  type WorkloadScope,
  type WorkloadScopeMode,
} from '../../lib/workload'
import { resolveDateRange } from '../../lib/workload/dateRanges'
import { UNASSIGNED_USER_ID } from '../../lib/workload/constants'
import { useAuthStore } from '../../stores/auth'
import {
  useProjectsStore,
  useCustomFieldsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../stores/entities'
import type { ISODate } from '../../types'
import { BucketTasksDialog } from './BucketTasksDialog'
import { CapacityEditorDialog } from './CapacityEditorDialog'
import { WorkloadEmptyState } from './WorkloadEmptyState'
import { WorkloadGrid } from './WorkloadGrid'
import { WorkloadSummaryStats } from './WorkloadSummaryStats'
import { WorkloadToolbar } from './WorkloadToolbar'
import type { WorkloadGroupBy } from './WorkloadToolbar'
import { useWorkloadEffort } from './useWorkloadEffort'
import { isTeamAdmin } from '../../lib/permissions'
import { PeopleDrilldownDialog } from './PeopleDrilldownDialog'

export type WorkloadViewProps = {
  workspaceId: string
  portfolioProjectIds?: string[]
  defaultTeamId?: string
}

/** Scoped workload view — reusable for workspace, portfolio, or team routes. */
export function WorkloadView({ workspaceId, portfolioProjectIds, defaultTeamId }: WorkloadViewProps) {
  const actorId = useAuthStore((s) => s.currentUserId) ?? ''
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const allTasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const customFields = useCustomFieldsStore((s) => s.list().filter((field) => field.workspaceId === workspaceId && field.type === 'number'))

  const [preset, setPreset] = useState<WorkloadPreset>('this_week')
  const [customStart, setCustomStart] = useState<ISODate>(() => resolveDateRange('this_week').start)
  const [customEnd, setCustomEnd] = useState<ISODate>(() => resolveDateRange('this_week').end)
  const [scale, setScale] = useState<TimeScale>('day')
  const [scopeMode, setScopeMode] = useState<WorkloadScopeMode>(defaultTeamId ? 'team' : 'all')
  const [teamId, setTeamId] = useState<string | undefined>(defaultTeamId)
  const [projectId, setProjectId] = useState<string | undefined>()
  const [capacityOpen, setCapacityOpen] = useState(false)
  const [selected, setSelected] = useState<{ userId: string; bucketKey: string } | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<WorkloadGroupBy>('person')
  const [effortFieldId, setEffortFieldId] = useState<string | undefined>()

  const scope: WorkloadScope = useMemo(
    () => ({
      workspaceId,
      mode: scopeMode,
      teamId: scopeMode === 'team' ? teamId : undefined,
      projectId: scopeMode === 'project' ? projectId : undefined,
      portfolioProjectIds,
    }),
    [workspaceId, scopeMode, teamId, projectId, portfolioProjectIds]
  )

  const { buckets, matrix, range } = useWorkloadEffort({
    workspaceId,
    scope,
    preset,
    customStart,
    customEnd,
    scale,
    effortFieldId,
  })

  const scopedTasks = useMemo(
    () => filterTasksForScope(allTasks, projects, scope),
    [allTasks, projects, scope]
  )

  const memberUsers = useMemo(() => {
    const ids = workspace?.memberIds ?? []
    return users.filter((u) => ids.includes(u.id))
  }, [users, workspace?.memberIds])

  const actor = users.find((u) => u.id === actorId)
  const selectedTeam = teams.find((team) => team.id === (teamId ?? defaultTeamId))
  const canEditCapacity = Boolean(workspace && actor && (
    workspace.adminIds.includes(actorId) || (selectedTeam && isTeamAdmin(actor, selectedTeam, workspace))
  ))

  const selectedRow = matrix.rows.find((r) => r.userId === selected?.userId)
  const selectedBucket = buckets.find((b) => b.key === selected?.bucketKey) ?? null

  async function handleDropOnRow(targetUserId: string, taskId: string) {
    await updateTask(
      taskId,
      { assigneeId: targetUserId === UNASSIGNED_USER_ID ? undefined : targetUserId },
      actorId
    )
  }

  async function handleDropOnCell(targetUserId: string, bucketKey: string, taskId: string) {
    const bucket = buckets.find((b) => b.key === bucketKey)
    if (!bucket) return
    const dueOn = defaultDueForBucket(bucket)
    await updateTask(
      taskId,
      {
        assigneeId: targetUserId === UNASSIGNED_USER_ID ? undefined : targetUserId,
        dueOn,
        startOn: dueOn,
      },
      actorId
    )
  }

  const showEmpty = scopedTasks.length === 0

  return (
    <div className="space-y-4">
      <WorkloadToolbar
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        scale={scale}
        onScaleChange={setScale}
        scopeMode={scopeMode}
        onScopeModeChange={setScopeMode}
        teamId={teamId}
        onTeamChange={setTeamId}
        projectId={projectId}
        onProjectChange={setProjectId}
        teams={teams}
        projects={projects}
        onExport={() => exportWorkloadCsv(matrix.rows, buckets)}
        onEditCapacity={() => setCapacityOpen(true)}
        canEditCapacity={canEditCapacity}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        effortFieldId={effortFieldId}
        onEffortFieldChange={setEffortFieldId}
        effortFields={customFields}
      />

      {!matrix.hasEstimateField ? (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)' }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
          <p style={{ color: 'var(--ink-secondary)' }}>
            No effort field detected — using default estimates. Add a numeric custom field named
            Estimate to your projects for accurate workload.
          </p>
        </div>
      ) : null}

      <WorkloadSummaryStats
        totalAssigned={matrix.totalAssignedTasks}
        overAllocated={matrix.overAllocatedPeople}
        peopleCount={matrix.rows.length}
      />

      {showEmpty ? (
        <WorkloadEmptyState />
      ) : (
        <WorkloadGrid
          rows={matrix.rows}
          buckets={buckets}
          range={range}
          onCellClick={(userId, bucketKey) => setSelected({ userId, bucketKey })}
          onDropTaskOnRow={handleDropOnRow}
          onDropTaskOnCell={handleDropOnCell}
          onPersonClick={setPersonId}
          groupBy={groupBy}
          teams={teams}
          projects={projects}
          tasks={scopedTasks}
        />
      )}

      <BucketTasksDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        userId={selected?.userId ?? ''}
        userLabel={selectedRow?.label ?? ''}
        bucket={selectedBucket}
        tasks={scopedTasks}
        users={memberUsers}
        actorId={actorId}
      />

      <CapacityEditorDialog open={capacityOpen} onOpenChange={setCapacityOpen} users={memberUsers} canEdit={canEditCapacity} />
      <PeopleDrilldownDialog open={Boolean(personId)} onOpenChange={(open) => !open && setPersonId(null)} user={users.find((user) => user.id === personId)} tasks={scopedTasks} />
    </div>
  )
}
