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
import { GanttView } from '../views/timeline/GanttView'
import { ProjectFilesGrid } from '../attachments/ProjectFilesGrid'
import { ProjectDashboardTab } from './ProjectDashboardTab'
import { VIEW_LABELS, normalizeProjectView, activeProjectViews } from './projectUtils'
import type { ProjectView } from '../../types'
import { canPerformWorkspaceAction } from '../../lib/permissions'

type Props = { projectId: string; routeView?: string }

type ProjectTab = ProjectView | 'overview' | 'messages' | 'files' | 'dashboard'

const VIEW_TABS: { id: ProjectTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'messages', label: 'Messages' },
  { id: 'list', label: VIEW_LABELS.list },
  { id: 'board', label: VIEW_LABELS.board },
  { id: 'timeline', label: VIEW_LABELS.timeline },
  { id: 'gantt', label: VIEW_LABELS.gantt },
  { id: 'calendar', label: VIEW_LABELS.calendar },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'files', label: 'Files' },
]

export function ProjectPage({ projectId, routeView }: Props) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const project = useProjectsStore((s) => s.getById(projectId))
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const members = useUsersStore((s) =>
    project ? project.memberIds.map((id) => s.getById(id)).filter((u): u is NonNullable<typeof u> => Boolean(u)) : []
  )
  const searchParams = useSearchParams()
  const viewParam = (routeView ?? searchParams.get('view')) as ProjectTab | null
  const messageIdParam = searchParams.get('messageId')
  const activeView: ProjectTab = !viewParam && project
    ? project.defaultView
    : viewParam === 'files' || viewParam === 'dashboard'
    ? viewParam
    : normalizeProjectView(viewParam)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const starredIds = user?.starredProjectIds ?? []
  const starred = starredIds.includes(projectId)
  const canEdit = canPerformWorkspaceAction(user, workspace, 'edit')

  const basePath = workspaceId
    ? `/dashboard/project-management/w/${workspaceId}/projects/${projectId}`
    : '#'

  const breadcrumbs = useMemo(
    () =>
      project && workspaceId
        ? [
            { label: 'Tasklytic', href: `/dashboard/project-management/w/${workspaceId}/home` },
            { label: 'Projects', href: `/dashboard/project-management/w/${workspaceId}/projects` },
            { label: project.name, href: activeView === 'overview' ? undefined : basePath },
            ...(activeView === 'overview' ? [] : [{ label: VIEW_TABS.find((tab) => tab.id === activeView)?.label ?? 'Project' }]),
          ]
        : [],
    [activeView, basePath, project, workspaceId]
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
    if (activeView === 'gantt') return <GanttView project={project} basePath={basePath} />
    if (activeView === 'files') return <ProjectFilesGrid project={project} />
    if (activeView === 'dashboard') return <ProjectDashboardTab project={project} basePath={basePath} />
    return null
  }, [activeView, basePath, messageIdParam, project, projectId])

  if (!project || !workspaceId || !currentUserId) {
    return <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Project not found.</p>
  }

  return (
    <div className="space-y-4" data-tour-page="projects">
      <ProjectHeader
        project={project}
        workspaceId={workspaceId}
        currentUserId={currentUserId}
        starred={starred}
        starredIds={starredIds}
        members={members}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        canEdit={canEdit}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>
          <Search className="mr-1 h-4 w-4" /> Search
        </Button>
        <Button size="sm" className=" border-0" disabled={!canEdit} onClick={() => setQuickAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add task
        </Button>
      </div>

      <nav className="flex flex-wrap gap-4 border-b pb-1" style={{ borderColor: 'hsl(var(--border))' }}>
        {VIEW_TABS.filter((t) => ['overview', 'messages', 'files', 'dashboard'].includes(t.id) || activeProjectViews(project.enabledViews).includes(t.id as ProjectView)).map((tab) => {
          const href = tab.id === 'overview'
            ? `${basePath}?view=overview`
            : tab.id === 'files'
              ? `${basePath}/files`
              : `${basePath}?view=${tab.id}`
          const active = activeView === tab.id
          return (
            <Link
              key={tab.id}
              href={href}
              className="relative pb-2 text-sm font-medium transition-colors"
              style={{ color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))' }}
            >
              {tab.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: 'hsl(var(--primary))' }} />
              )}
            </Link>
          )
        })}
      </nav>

      <div data-project-view={activeView}>{content}</div>
      <TaskDetailPane workspaceId={workspaceId} />
      <QuickAddTaskDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} workspaceId={workspaceId} defaultProjectId={projectId} />
    </div>
  )
}
