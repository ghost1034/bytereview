'use client'

/** ProjectsIndex — searchable project grid/list with filters. */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageMeta } from './hooks/usePageMeta'
import { useWorkspaceContext } from './hooks/useWorkspaceContext'
import { toggleStarProject } from './lib/projectActions'
import { useAuthStore, useUiStore } from './stores/auth'
import { useProjectsStore, useTeamsStore, useUsersStore } from './stores/entities'
import { ProjectCard } from './features/projects/ProjectCard'
import { CreateProjectDialog } from './features/projects/CreateProjectDialog'
import { ProjectStatusPill } from './features/projects/ProjectStatusPill'
import { STATUS_LABELS } from './features/projects/projectUtils'
import type { ProjectStatus } from './types'

export function ProjectsIndex() {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const allProjects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId))
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [starredOnly, setStarredOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const viewMode = useUiStore((s) => s.projectViewMode)
  const setViewMode = useUiStore((s) => s.setProjectViewMode)
  const starredIds = user?.starredProjectIds ?? []

  usePageMeta({
    breadcrumbs: workspaceId
      ? [
          { label: 'AI Project Management', href: `/dashboard/project-management/w/${workspaceId}/home` },
          { label: 'Projects' },
        ]
      : [{ label: 'Projects' }],
  })

  const filtered = useMemo(() => {
    return allProjects
      .filter((p) => (showArchived ? p.archived : !p.archived))
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => teamFilter === 'all' || p.teamId === teamFilter)
      .filter((p) => statusFilter === 'all' || p.status === statusFilter)
      .filter((p) => !starredOnly || starredIds.includes(p.id))
      .sort((a, b) => {
        const aStar = starredIds.includes(a.id) ? 0 : 1
        const bStar = starredIds.includes(b.id) ? 0 : 1
        return aStar - bStar || a.name.localeCompare(b.name)
      })
  }, [allProjects, query, teamFilter, statusFilter, starredOnly, showArchived, starredIds])

  if (!workspaceId) return null

  return (
    <div className="space-y-4" data-tour-page="projects">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Projects</h1>
        <Button className="tl-btn-primary border-0" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New project
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="tl-input h-10 max-w-sm flex-1 px-3 text-sm"
        />
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Team" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as Exclude<ProjectStatus, null>[]).map((key) => (
              <SelectItem key={key} value={key}>{STATUS_LABELS[key]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} />
          Starred
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archived
        </label>
        <div className="flex rounded-lg border p-0.5 text-sm" style={{ borderColor: 'var(--border-subtle)' }}>
          <button type="button" className="rounded-md px-3 py-1" style={{ background: viewMode === 'grid' ? 'var(--primary-soft)' : undefined }} onClick={() => setViewMode('grid')}>Grid</button>
          <button type="button" className="rounded-md px-3 py-1" style={{ background: viewMode === 'list' ? 'var(--primary-soft)' : undefined }} onClick={() => setViewMode('list')}>List</button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="flex flex-wrap gap-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              href={`/dashboard/project-management/w/${workspaceId}/projects/${p.id}`}
              starred={starredIds.includes(p.id)}
              currentUserId={currentUserId ?? undefined}
              onToggleStar={
                currentUserId
                  ? () => void toggleStarProject(p.id, currentUserId, starredIds)
                  : undefined
              }
            />
          ))}
          {!filtered.length && (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No projects match your filters.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}>
              <tr>
                <th className="px-4 py-2 text-left font-medium">Project</th>
                <th className="px-4 py-2 text-left font-medium">Team</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Members</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const team = teams.find((t) => t.id === p.teamId)
                return (
                  <tr key={p.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/project-management/w/${workspaceId}/projects/${p.id}`} className="flex items-center gap-2 font-medium hover:underline">
                        <span>{p.iconEmoji}</span>
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{team?.name ?? '—'}</td>
                    <td className="px-4 py-3"><ProjectStatusPill status={p.status} /></td>
                    <td className="px-4 py-3">{p.memberIds.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-4 text-sm" style={{ color: 'var(--ink-muted)' }}>No projects match your filters.</p>
          )}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
    </div>
  )
}
