'use client'

/** PortfoliosPage — home list with filters, grid/table toggle, and create flow. */
import { useMemo, useState } from 'react'
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DEFAULT_PORTFOLIO_FILTERS,
  filterPortfolios,
  type PortfolioListFilters,
} from '../../lib/portfolios/filterPortfolios'
import { asEnriched } from '../../lib/portfolios/types'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import {
  usePortfoliosStore,
  useProjectsStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import { computePortfolioHealth, formatProjectStatus, getProjectStatusColor } from './portfolioHealth'
import { CreateOrEditPortfolioModal } from './CreateOrEditPortfolioModal'
import { PortfolioCard } from './PortfolioCard'
import { PortfolioEmptyState } from './PortfolioEmptyState'

type ViewMode = 'grid' | 'table'

export function PortfoliosPage() {
  const { workspaceId } = useWorkspaceContext()
  const portfolios = usePortfoliosStore((s) =>
    s
      .list()
      .filter((p) => p.workspaceId === workspaceId)
      .map((p) => asEnriched(p))
      .filter((p): p is NonNullable<ReturnType<typeof asEnriched>> => Boolean(p))
  )
  const projects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const [createOpen, setCreateOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filters, setFilters] = useState<PortfolioListFilters>(DEFAULT_PORTFOLIO_FILTERS)

  usePageMeta({ breadcrumbs: [{ label: 'Portfolios' }] })

  const filtered = useMemo(
    () => filterPortfolios(portfolios, filters, projects, tasks),
    [portfolios, filters, projects, tasks]
  )

  if (!workspaceId) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Portfolios</h1>
        <Button className="tl-btn-primary border-0" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New portfolio
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <Input
            className="tl-input pl-8"
            placeholder="Search portfolios…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <Select value={filters.ownerId} onValueChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))}>
          <SelectTrigger className="tl-input w-[140px]"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All owners</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={filters.status === 'all' ? 'all' : (filters.status ?? 'all')}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v === 'all' ? 'all' : (v as PortfolioListFilters['status']) }))}
        >
          <SelectTrigger className="tl-input w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="on_track">On track</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="off_track">Off track</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.timePeriod} onValueChange={(v) => setFilters((f) => ({ ...f, timePeriod: v as PortfolioListFilters['timePeriod'] }))}>
          <SelectTrigger className="tl-input w-[130px]"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
          <button type="button" className="rounded p-1.5" style={{ background: viewMode === 'grid' ? 'var(--primary-soft)' : undefined }} onClick={() => setViewMode('grid')} aria-label="Grid view">
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-1.5" style={{ background: viewMode === 'table' ? 'var(--primary-soft)' : undefined }} onClick={() => setViewMode('table')} aria-label="Table view">
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length ? (
        viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => <PortfolioCard key={p.id} portfolio={p} workspaceId={workspaceId} />)}
          </div>
        ) : (
          <div className="tl-card overflow-hidden shadow-paper-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const health = computePortfolioHealth(p, projects, tasks)
                  const owner = users.find((u) => u.id === p.ownerId)
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/dashboard/project-management/w/${workspaceId}/portfolios/${p.id}`} className="font-medium hover:underline">
                          {p.iconEmoji ?? '📊'} {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>{owner?.name ?? '—'}</TableCell>
                      <TableCell>{p.projectIds.length}</TableCell>
                      <TableCell>
                        <span className="rounded-full px-2 py-0.5 text-xs capitalize" style={{ background: `${getProjectStatusColor(health.inferredStatus)}22`, color: getProjectStatusColor(health.inferredStatus) }}>
                          {formatProjectStatus(health.inferredStatus)}
                        </span>
                      </TableCell>
                      <TableCell>{health.progressPct}%</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        <PortfolioEmptyState hint={portfolios.length ? 'No portfolios match your filters.' : undefined} />
      )}

      <CreateOrEditPortfolioModal open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
    </div>
  )
}
