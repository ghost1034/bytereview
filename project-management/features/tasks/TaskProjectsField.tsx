'use client'

/**
 * TaskProjectsField — multi-home project pills with section picker per project.
 */
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addToProject, removeFromProject, setSectionForProject } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useSectionsStore } from '../../stores/entities'
import type { Task } from '../../types'

type Props = { task: Task }

export function TaskProjectsField({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === task.workspaceId && !p.archived)
  )
  const sections = useSectionsStore((s) => s.list())
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)

  const taskProjects = useMemo(
    () => task.projectIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean),
    [projects, task.projectIds]
  )

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.filter(
      (p) => !task.projectIds.includes(p.id) && (!q || p.name.toLowerCase().includes(q))
    )
  }, [projects, query, task.projectIds])

  const sectionsFor = (projectId: string) =>
    sections.filter((s) => s.projectId === projectId).sort((a, b) => a.order - b.order)

  const pickProject = (projectId: string) => {
    if (!currentUserId) return
    const secs = sectionsFor(projectId)
    if (secs.length <= 1) {
      void addToProject(task.id, projectId, secs[0]?.id, currentUserId)
      setOpen(false)
      setQuery('')
      return
    }
    setPendingProjectId(projectId)
  }

  const confirmSection = async (sectionId: string) => {
    if (!currentUserId || !pendingProjectId) return
    await addToProject(task.id, pendingProjectId, sectionId, currentUserId)
    setPendingProjectId(null)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span style={{ color: 'var(--ink-muted)' }}>Projects</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
              <Plus className="h-3 w-3" /> Add
            </button>
          </PopoverTrigger>
          <PopoverContent className="tl-popover-surface w-64 p-2" align="end">
            {pendingProjectId ? (
              <div>
                <p className="mb-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
                  Choose a section
                </p>
                <Select onValueChange={(v) => void confirmSection(v)}>
                  <SelectTrigger className="tl-input h-8 text-sm">
                    <SelectValue placeholder="Section…" />
                  </SelectTrigger>
                  <SelectContent className="tl-popover-surface z-[100]">
                    {sectionsFor(pendingProjectId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="mt-2 text-xs"
                  style={{ color: 'var(--ink-muted)' }}
                  onClick={() => setPendingProjectId(null)}
                >
                  Back
                </button>
              </div>
            ) : (
              <>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="tl-input h-8 text-sm"
                  autoFocus
                />
                <ul className="mt-2 max-h-40 overflow-y-auto">
                  {available.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--bg-muted)]"
                        onClick={() => pickProject(p.id)}
                      >
                        <span>{p.iconEmoji ?? '📁'}</span>
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {taskProjects.length ? (
          taskProjects.map((p) =>
            p ? (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                style={{ background: 'var(--bg-muted)', color: 'var(--ink-secondary)' }}
              >
                <span>{p.iconEmoji ?? '📁'}</span>
                {p.name}
                {sectionsFor(p.id).length ? (
                  <Select
                    value={task.sectionIdByProject[p.id] ?? ''}
                    onValueChange={(v) => currentUserId && void setSectionForProject(task.id, p.id, v, currentUserId)}
                  >
                    <SelectTrigger className="h-5 w-auto gap-0 border-0 bg-transparent px-1 text-xs shadow-none">
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent className="tl-popover-surface z-[100]">
                      {sectionsFor(p.id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove from ${p.name}`}
                  onClick={() => currentUserId && void removeFromProject(task.id, p.id, currentUserId)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null
          )
        ) : (
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            No projects
          </span>
        )}
      </div>
    </div>
  )
}
