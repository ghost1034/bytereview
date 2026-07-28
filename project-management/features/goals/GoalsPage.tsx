'use client'

/** Goals home — tabs, filters, tree/list views, side panel. */
import { useMemo, useState } from 'react'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useGoalsStore, useUsersStore } from '../../stores/entities'
import type { Goal } from '../../types'
import type { GoalTab } from '../../lib/goals/goalSelectors'
import { filterGoals } from '../../lib/goals/goalSelectors'
import { CreateOrEditGoalModal } from './CreateOrEditGoalModal'
import { GoalDetailPanel } from './GoalDetailPanel'
import { GoalsEmptyState } from './GoalsEmptyState'
import { GoalsListView } from './GoalsListView'
import { GoalsToolbar, type GoalsViewMode } from './GoalsToolbar'
import { GoalsTreeView } from './GoalsTreeView'

const TAB_LABELS: Record<GoalTab, string> = {
  mine: 'My goals',
  followed: 'Followed goals',
  team: 'Team goals',
  company: 'Company goals',
  all: 'All goals',
}

/** Main goals & OKRs page for a workspace. */
export function GoalsPage() {
  const { workspaceId, teams } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const allGoals = useGoalsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())

  const [tab, setTab] = useState<GoalTab>('mine')
  const [viewMode, setViewMode] = useState<GoalsViewMode>('tree')
  const [timeFilter, setTimeFilter] = useState<'all' | 'quarter' | 'year'>('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<Goal['status'] | 'all'>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Goal | null>(null)

  usePageMeta({ breadcrumbs: [{ label: 'Goals' }] })

  const filtered = useMemo(
    () =>
      workspaceId && currentUserId
        ? filterGoals(allGoals, {
            workspaceId,
            tab,
            currentUserId,
            teams,
            timeFilter,
            ownerId: ownerFilter,
            status: statusFilter,
            search,
          })
        : [],
    [allGoals, workspaceId, tab, currentUserId, teams, timeFilter, ownerFilter, statusFilter, search]
  )

  const owners = useMemo(
    () =>
      users
        .filter((u) => filtered.some((g) => g.ownerId === u.id) || allGoals.some((g) => g.ownerId === u.id))
        .map((u) => ({ id: u.id, name: u.name })),
    [users, filtered, allGoals]
  )

  if (!workspaceId || !currentUserId) return null

  return (
    <div className="space-y-4">
      <GoalsToolbar
        tab={tab}
        onTabChange={setTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        owners={owners}
        onCreate={() => setCreateOpen(true)}
      />

      {filtered.length ? (
        viewMode === 'tree' ? (
          <GoalsTreeView
            goals={filtered}
            workspaceId={workspaceId}
            selectedId={selected?.id}
            onSelect={setSelected}
          />
        ) : (
          <GoalsListView goals={filtered} workspaceId={workspaceId} />
        )
      ) : (
        <GoalsEmptyState tabLabel={TAB_LABELS[tab]} onCreate={() => setCreateOpen(true)} />
      )}

      {selected && viewMode === 'tree' ? (
        <GoalDetailPanel
          goal={selected}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
        />
      ) : null}

      <CreateOrEditGoalModal open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
    </div>
  )
}
