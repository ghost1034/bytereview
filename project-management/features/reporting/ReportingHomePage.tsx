'use client'

/** Reporting home — dashboard list with search and filters. */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ReportingDashboard } from '../../lib/reporting/types'
import { canViewDashboard } from '../../lib/reporting/dashboardPermissions'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useDashboardsStore, useUsersStore } from '../../stores/entities'
import { useAuthStore } from '../../stores/auth'
import { CreateDashboardDialog } from './CreateDashboardDialog'
import { DashboardCard } from './DashboardCard'
import { ReportingEmptyState } from './ReportingEmptyState'
import { useReportingData } from './useReportingData'

/** Workspace reporting index with dashboard cards and create flow. */
export function ReportingHomePage() {
  const router = useRouter()
  const { workspaceId, workspace } = useWorkspaceContext()
  const currentUserId = useAuthStore((state) => state.currentUserId)
  const basePath = workspaceId ? `/dashboard/project-management/w/${workspaceId}` : ''
  const dashboards = useDashboardsStore((s) => s.list()) as ReportingDashboard[]
  const users = useUsersStore((s) => s.list())
  const dataCtx = useReportingData(workspaceId)

  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)

  usePageMeta({ breadcrumbs: workspaceId ? [
    { label: 'AI Project Management', href: `${basePath}/home` },
    { label: 'Reporting' },
  ] : [] })

  const filtered = useMemo(() => {
    if (!workspaceId) return []
    return dashboards
      .filter((d) => d.workspaceId === workspaceId)
      .filter((d) => canViewDashboard(d, currentUserId, workspace))
      .filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
      .filter((d) => (ownerFilter === 'all' ? true : d.ownerId === ownerFilter))
      .filter((d) => {
        if (dateFilter === 'all') return true
        const created = new Date(d.createdAt).getTime()
        const nowMs = Date.now()
        const day = 86400000
        if (dateFilter === '7d') return nowMs - created <= 7 * day
        if (dateFilter === '30d') return nowMs - created <= 30 * day
        return true
      })
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
  }, [dashboards, workspaceId, workspace, currentUserId, search, ownerFilter, dateFilter])

  if (!workspaceId || !dataCtx) return null

  return (
    <div className="space-y-4" data-tour-page="reporting">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Reporting</h1>
        <Button className="tl-btn-primary gap-2 border-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New dashboard
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <Input
            className="pl-9"
            placeholder="Search dashboards"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All owners</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Created" />
          </SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">Any date</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <ReportingEmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              owner={users.find((u) => u.id === dashboard.ownerId)}
              basePath={basePath}
              dataCtx={dataCtx}
            />
          ))}
        </div>
      )}

      <CreateDashboardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        onCreated={(id) => router.push(`${basePath}/reporting/${id}`)}
      />
    </div>
  )
}
