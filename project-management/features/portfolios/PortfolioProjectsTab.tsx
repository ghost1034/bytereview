'use client'

/** PortfolioProjectsTable — sortable, draggable project grid with inline edits. */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { GripVertical, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { updateProjectStatus } from '../../lib/projectActions'
import { reorderPortfolioProjects, removeProjectsFromPortfolio } from '../../lib/portfolios/portfolioActions'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { formatDate } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import type { Project, ProjectStatus } from '../../types'
import { projectProgress } from '../projects/projectUtils'
import { ProjectStatusPill } from '../projects/ProjectStatusPill'
import { PortfolioAddProjectsDialog } from './PortfolioAddProjectsDialog'
import { PortfolioProjectFieldEditor } from './PortfolioProjectFieldEditor'
import { PortfolioProjectsToolbar } from './PortfolioProjectsToolbar'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
}

export function PortfolioProjectsTab({ portfolio, workspaceId }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const allProjects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const fields = useCustomFieldsStore((s) =>
    portfolio.customFieldIds
      .map((id) => s.getById(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
  )
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const ordered = useMemo(() => {
    const map = new Map(allProjects.map((p) => [p.id, p]))
    return portfolio.projectIds.map((id) => map.get(id)).filter((p): p is Project => Boolean(p))
  }, [allProjects, portfolio.projectIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ordered.filter((p) => {
      if (statusFilter !== 'all' && (p.status ?? 'unset') !== statusFilter) return false
      if (ownerFilter !== 'all' && p.ownerId !== ownerFilter) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [ordered, ownerFilter, search, statusFilter])

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = [...portfolio.projectIds]
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    await reorderPortfolioProjects(portfolio.id, ids)
    setDragId(null)
  }

  const bulkSetStatus = async (status: ProjectStatus) => {
    if (!currentUserId || !status) return
    await Promise.all(selected.map((id) => updateProjectStatus(id, status, currentUserId)))
    setSelected([])
  }

  const bulkRemove = async () => {
    await removeProjectsFromPortfolio(portfolio.id, selected)
    setSelected([])
  }

  return (
    <div className="space-y-3">
      <PortfolioProjectsToolbar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        ownerFilter={ownerFilter}
        onOwnerFilter={setOwnerFilter}
        users={users}
        selectedCount={selected.length}
        onBulkStatus={(s) => void bulkSetStatus(s)}
        onBulkRemove={() => void bulkRemove()}
      />

      <div className="tl-card overflow-x-auto shadow-paper-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-8" />
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Due</TableHead>
              {fields.map((f) => <TableHead key={f.id}>{f.name}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const owner = users.find((u) => u.id === p.ownerId)
              const pct = projectProgress(tasks, p.id)
              return (
                <TableRow
                  key={p.id}
                  draggable
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void onDrop(p.id)}
                >
                  <TableCell>
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                  </TableCell>
                  <TableCell><GripVertical className="h-4 w-4 cursor-grab" style={{ color: 'var(--ink-muted)' }} /></TableCell>
                  <TableCell>
                    <Link href={`/dashboard/tasklytic/w/${workspaceId}/projects/${p.id}`} className="flex items-center gap-2 hover:underline">
                      <span>{p.iconEmoji ?? '📁'}</span>
                      <span className="font-medium">{p.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ProjectStatusPill
                      status={p.status}
                      editable
                      onChange={(s) => currentUserId && s && void updateProjectStatus(p.id, s, currentUserId)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[100px] items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full" style={{ background: 'var(--bg-muted)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                      </div>
                      <span className="text-xs tabular-nums">{pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] text-white" style={{ background: owner?.avatarColor }}>
                      {owner?.name.slice(0, 1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{p.startOn ? formatDate(p.startOn) : '—'}</TableCell>
                  <TableCell className="text-sm">{p.dueOn ? formatDate(p.dueOn) : '—'}</TableCell>
                  {fields.map((f) => (
                    <TableCell key={f.id}>
                      <PortfolioProjectFieldEditor portfolioId={portfolio.id} projectId={p.id} field={f} />
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add work
      </Button>

      <PortfolioAddProjectsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        workspaceId={workspaceId}
        portfolioId={portfolio.id}
        existingProjectIds={portfolio.projectIds}
      />
    </div>
  )
}
