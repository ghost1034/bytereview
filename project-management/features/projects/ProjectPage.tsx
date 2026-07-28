'use client'

/**
 * ProjectPage — project shell with view tabs (Overview, List, Board, …).
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useUsersStore } from '../../stores/entities'
import { useUiStore } from '../../stores/auth'
import { ProjectOverview } from './ProjectOverview'
import { ProjectMessages } from '../messages/ProjectMessages'
import { ProjectHeader } from './ProjectHeader'
import { QuickAddTaskDialog } from '../tasks/QuickAddTaskDialog'
import { TaskDetailPane } from '../tasks/TaskDetailPane'
import { ListView } from '../views/list/ListView'
import { BoardView } from '../views/board/BoardView'
import { CalendarView } from '../views/calendar/CalendarView'
import { TimelineView } from '../views/timeline/TimelineView'
import { VIEW_LABELS, normalizeProjectView, activeProjectViews } from './projectUtils'
import type { ProjectView } from '../../types'

type Props = { projectId: string }

const VIEW_TABS: { id: ProjectView | 'overview' | 'messages'; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'messages', label: 'Messages' },
  { id: 'list', label: VIEW_LABELS.list },
  { id: 'board', label: VIEW_LABELS.board },
  { id: 'timeline', label: VIEW_LABELS.timeline },
  { id: 'calendar', label: VIEW_LABELS.calendar },
]

export function ProjectPage({ projectId }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const project = useProjectsStore((s) => s.getById(projectId))
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const members = useUsersStore((s) =>
    project ? project.memberIds.map((id) => s.getById(id)).filter((u): u is NonNullable<typeof u> => Boolean(u)) : []
  )
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view') as ProjectView | 'overview' | 'messages' | null
  const messageIdParam = searchParams.get('messageId')
  const activeView = normalizeProjectView(viewParam)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const starredIds = user?.starredProjectIds ?? []
  const starred = starredIds.includes(projectId)

  const basePath = workspaceId
    ? `/dashboard/tasklytic/w/${workspaceId}/projects/${projectId}`
    : '#'

  const breadcrumbs = useMemo(
    () =>
      project && workspaceId
        ? [
            { label: 'Tasklytic', href: `/dashboard/tasklytic/w/${workspaceId}/home` },
            { label: 'Projects', href: `/dashboard/tasklytic/w/${workspaceId}/projects` },
            { label: project.name },
          ]
        : [],
    [project?.name, workspaceId]
  )

  usePageMeta({ breadcrumbs })

  const content = useMemo(() => {
    if (!project) return null
    if (activeView === 'overview') return <ProjectOverview project={project} />
    if (activeView === 'messages') {
      return (
        <ProjectMessages
          projectId={projectId}
          selectedMessageId={messageIdParam}
          basePath={basePath}
        />
      )
    }
    if (activeView === 'list') return <ListView project={project} basePath={basePath} />
    if (activeView === 'board') return <BoardView project={project} basePath={basePath} />
    if (activeView === 'calendar') return <CalendarView project={project} basePath={basePath} />
    if (activeView === 'timeline') return <TimelineView project={project} basePath={basePath} />
    return null
  }, [activeView, basePath, messageIdParam, project, projectId])

  if (!project || !workspaceId || !currentUserId) {
    return <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Project not found.</p>
  }

  return (
    <div className="space-y-4">
      <ProjectHeader
        project={project}
        workspaceId={workspaceId}
        currentUserId={currentUserId}
        starred={starred}
        starredIds={starredIds}
        members={members}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>
          <Search className="mr-1 h-4 w-4" /> Search
        </Button>
        <Button size="sm" className="tl-btn-primary border-0" onClick={() => setQuickAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add task
        </Button>
      </div>

      <nav className="flex flex-wrap gap-4 border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
        {VIEW_TABS.filter((t) => t.id === 'overview' || t.id === 'messages' || activeProjectViews(project.enabledViews).includes(t.id as ProjectView)).map((tab) => {
          const href = tab.id === 'overview' ? basePath : `${basePath}?view=${tab.id}`
          const active = activeView === tab.id
          return (
            <Link
              key={tab.id}
              href={href}
              className="relative pb-2 text-sm font-medium transition-colors"
              style={{ color: active ? 'var(--primary)' : 'var(--ink-secondary)' }}
            >
              {tab.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {content}
      <TaskDetailPane workspaceId={workspaceId} />
      <QuickAddTaskDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} workspaceId={workspaceId} defaultProjectId={projectId} />
    </div>
  )
}
