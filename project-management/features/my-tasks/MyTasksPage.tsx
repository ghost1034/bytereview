'use client'

/**
 * MyTasksPage — personal task hub with List, Board, and Calendar views.
 */
import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore } from '../../stores/entities'
import { TaskDetailPane } from '../tasks/TaskDetailPane'
import { MyTasksBoard } from './MyTasksBoard'
import { MyTasksCalendar } from './MyTasksCalendar'
import { MyTasksHeader } from './MyTasksHeader'
import { MyTasksList } from './MyTasksList'
import { useMyTasksLayout } from './useMyTasksLayout'
import type { MyTasksViewMode } from './types'

/** Full My Tasks hub for the signed-in user. */
export function MyTasksPage() {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view') as MyTasksViewMode | null
  const viewMode: MyTasksViewMode =
    viewParam === 'board' || viewParam === 'calendar' ? viewParam : 'list'
  const { layout, updateLayout } = useMyTasksLayout(workspaceId ?? '', currentUserId)
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const defaultProjectId = projects[0]?.id

  const basePath = workspaceId ? `/dashboard/project-management/w/${workspaceId}/my-tasks` : '#'

  usePageMeta({ breadcrumbs: [{ label: 'My Tasks' }] })

  const body = useMemo(() => {
    if (!workspaceId) return null
    if (viewMode === 'board') return <MyTasksBoard workspaceId={workspaceId} basePath={basePath} />
    if (viewMode === 'calendar') return <MyTasksCalendar workspaceId={workspaceId} basePath={basePath} />
    return (
      <MyTasksList workspaceId={workspaceId} basePath={basePath} defaultProjectId={defaultProjectId} />
    )
  }, [basePath, defaultProjectId, viewMode, workspaceId])

  if (!workspaceId || !currentUserId) {
    return <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Sign in to view your tasks.</p>
  }

  return (
    <div className="space-y-4">
      <MyTasksHeader
        workspaceId={workspaceId}
        userId={currentUserId}
        viewMode={viewMode}
        layout={layout}
        onUpdateLayout={updateLayout}
      />
      {body}
      <TaskDetailPane workspaceId={workspaceId} />
    </div>
  )
}
