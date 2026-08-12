'use client'

/**
 * Command palette (⌘K) — search pages, projects, tasks, and actions with keyboard navigation.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useUiStore } from '../../stores/auth'
import { useGoalsStore, useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { searchWorkspace, searchWorkspaceGoals, searchWorkspacePeople } from '../../lib/search/searchIndex'
import { useAuth } from '@/contexts/AuthContext'
import { HighlightMatch } from './CommandPaletteHighlight'
import { filterDestinations } from './searchDestinations'

type FlatItem = {
  label: string
  href?: string
  group: string
  action?: 'quickAdd' | 'createProject' | 'toggleTheme' | 'signOut'
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const dispatchShellAction = useUiStore((s) => s.dispatchShellAction)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { workspaceId, workspace } = useWorkspaceContext()
  const { signOut } = useAuth()
  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const tasks = useTasksStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const goals = useGoalsStore((s) => s.list().filter((goal) => goal.workspaceId === workspaceId))
  const people = useUsersStore((s) => s.list().filter((user) => workspace?.memberIds.includes(user.id)))

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const flatItems = useMemo(() => {
    const base = workspaceId ? `/dashboard/project-management/w/${workspaceId}` : '/dashboard/project-management'
    const q = query.trim().toLowerCase()
    const items: FlatItem[] = []

    filterDestinations(query, base).forEach((p) => items.push({ ...p, group: 'Pages' }))

    if (workspaceId && q) {
      searchWorkspace(q, workspaceId, projects, tasks, base).forEach((hit) => {
        items.push({
          label: hit.label,
          href: hit.href,
          group: hit.type === 'project' ? 'Projects' : 'Tasks',
        })
      })
      searchWorkspaceGoals(q, workspaceId, goals).slice(0, 20).forEach((goal) => items.push({ label: goal.name, href: `${base}/goals/${goal.id}`, group: 'Goals' }))
      searchWorkspacePeople(q, workspace?.memberIds ?? [], people).slice(0, 20).forEach((person) => items.push({ label: person.name, href: `${base}/people/${person.id}`, group: 'People' }))
    } else if (workspaceId) {
      projects.slice(0, 8).forEach((p) =>
        items.push({ label: p.name, href: `${base}/projects/${p.id}`, group: 'Projects' })
      )
      tasks.slice(0, 8).forEach((t) => {
        const projectId = t.projectIds[0]
        items.push({
          label: t.name,
          href: projectId ? `${base}/projects/${projectId}?task=${t.id}` : `${base}/projects?task=${t.id}`,
          group: 'Tasks',
        })
      })
      goals.slice(0, 8).forEach((goal) => items.push({ label: goal.name, href: `${base}/goals/${goal.id}`, group: 'Goals' }))
      people.slice(0, 8).forEach((person) => items.push({ label: person.name, href: `${base}/people/${person.id}`, group: 'People' }))
    }

    const actions: FlatItem[] = [
      { label: 'Create task', group: 'Actions', action: 'quickAdd' },
      { label: 'Create project', group: 'Actions', action: 'createProject' },
      { label: 'Toggle theme', group: 'Actions', action: 'toggleTheme' },
      { label: 'Sign out', group: 'Actions', action: 'signOut' },
    ]
    actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .forEach((a) => items.push(a))

    return items
  }, [goals, people, projects, query, tasks, workspace?.memberIds, workspaceId])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const runItem = async (item: FlatItem) => {
    setOpen(false)
    setQuery('')
    if (item.action === 'quickAdd') {
      dispatchShellAction('quickAdd')
      return
    }
    if (item.action === 'createProject') {
      dispatchShellAction('createProject')
      return
    }
    if (item.action === 'toggleTheme') {
      dispatchShellAction('toggleTheme')
      return
    }
    if (item.action === 'signOut') {
      await signOut()
      return
    }
    if (item.href) router.push(item.href)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (flatItems.length ? (i + 1) % flatItems.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[activeIndex]
      if (item) void runItem(item)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const grouped = useMemo(() => {
    const sections: { title: string; items: FlatItem[] }[] = []
    flatItems.forEach((item) => {
      const last = sections[sections.length - 1]
      if (last?.title === item.group) last.items.push(item)
      else sections.push({ title: item.group, items: [item] })
    })
    return sections
  }, [flatItems])

  let runningIndex = 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined} className="tl-dialog-surface max-w-[600px] gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <Search className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search project management…"
            className="w-full bg-transparent text-sm outline-none focus-visible:ring-0"
            style={{ color: 'var(--ink-primary)' }}
            aria-label="Search project management"
          />
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {grouped.map(({ title, items }) => (
            <div key={title} className="mb-3">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                {title}
              </p>
              {items.map((item) => {
                const index = runningIndex++
                const active = index === activeIndex
                return (
                  <button
                    key={`${item.group}-${item.label}-${item.href ?? item.action}`}
                    type="button"
                    data-index={index}
                    onClick={() => void runItem(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn('flex w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:shadow-focus')}
                    style={{
                      color: 'var(--ink-secondary)',
                      background: active ? 'var(--bg-muted)' : 'transparent',
                    }}
                  >
                    <HighlightMatch text={item.label} query={query} />
                  </button>
                )
              })}
            </div>
          ))}
          {!flatItems.length && (
            <p className="px-3 py-6 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
              {query ? 'No results' : 'Type to search…'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
