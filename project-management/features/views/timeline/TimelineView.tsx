'use client'

/**
 * TimelineView — flat/swimlane timeline with query toolbar and shared renderer.
 */
import { useCallback, useMemo, useState } from 'react'
import { startOfDay } from 'date-fns'
import type { Project } from '../../../types'
import { useAuthStore } from '../../../stores/auth'
import { useSectionsStore, useTagsStore, useTasksStore, useUsersStore } from '../../../stores/entities'
import { enforceDependentScheduling } from '../../../lib/dependencyScheduling'
import { applyViewQuery } from '../../../lib/query/applyQuery'
import { QueryToolbar } from '../../query/QueryToolbar'
import { useViewQuery } from '../../query/useViewQuery'
import { useOpenProjectTask } from '../../tasks/useTaskDetailUrl'
import { tasklyticToast } from '../../ui/tasklyticToast'
import { TimelineRenderer } from './TimelineRenderer'
import { TimelineToolbar } from './TimelineToolbar'
import { TimelineToolbarExtras } from './TimelineToolbarExtras'
import { dateToX, defaultRange } from './timelineUtils'
import { useTimelineState } from './useTimelineState'

type Props = { project: Project; basePath: string }

export function TimelineView({ project, basePath }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const { query, setQuery } = useViewQuery(project.id, 'timeline')
  const ui = useTimelineState(project.id)
  const openTask = useOpenProjectTask(basePath, 'timeline')
  const [linkError, setLinkError] = useState<string | null>(null)

  const sections = useSectionsStore((s) =>
    s.list().filter((sec) => sec.projectId === project.id).sort((a, b) => a.order - b.order)
  )
  const allTasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list())

  const tasks = useMemo(
    () =>
      applyViewQuery(
        allTasks.filter((t) => t.projectIds.includes(project.id) && !t.parentId),
        query,
        project.id,
        currentUserId
      ),
    [allTasks, currentUserId, project.id, query]
  )

  const jumpToday = useCallback(() => {
    const range = defaultRange(tasks)
    const todayX = dateToX(startOfDay(new Date()), range.start, ui.zoom)
    ui.setPanX(-todayX + 120)
  }, [tasks, ui])

  const handleAutoShift = useCallback(
    async (enabled: boolean) => {
      ui.setAutoShift(enabled)
      if (!enabled || !currentUserId) return
      const shifted = await enforceDependentScheduling(tasks, currentUserId)
      if (shifted > 0) {
        setLinkError(null)
        tasklyticToast(`Moved ${shifted} dependent task${shifted === 1 ? '' : 's'}`, {
          description: 'Dates adjusted so each task starts after its predecessors finish.',
          status: 'success',
        })
      } else {
        tasklyticToast('Dependents already aligned', {
          description: 'No date changes needed. Auto-shift will apply when you drag predecessor bars.',
          status: 'info',
        })
      }
    },
    [currentUserId, tasks, ui]
  )

  return (
    <div>
      <QueryToolbar
        query={query}
        onChange={setQuery}
        projectId={project.id}
        viewType="timeline"
        sections={sections}
        members={users.filter((u) => project.memberIds.includes(u.id))}
        tags={tags.filter((t) => t.workspaceId === project.workspaceId)}
        showGroupBy={false}
      />

      <TimelineToolbar
        zoom={ui.zoom}
        onZoom={ui.setZoom}
        onZoomIn={ui.zoomIn}
        onZoomOut={ui.zoomOut}
        colorBy={ui.colorBy}
        onColorBy={ui.setColorBy}
        rowsBy={ui.rowsBy}
        onRowsBy={ui.setRowsBy}
        autoShift={ui.autoShift}
        onAutoShift={handleAutoShift}
        highlightCriticalPath={ui.highlightCriticalPath}
        onHighlightCriticalPath={ui.setHighlightCriticalPath}
        linkError={linkError}
        extra={
          <TimelineToolbarExtras
            tasks={tasks}
            showBaseline={ui.showBaseline}
            hasBaseline={Boolean(ui.baseline)}
            onShowBaseline={ui.setShowBaseline}
            onSaveBaseline={ui.saveBaseline}
            onClearBaseline={ui.clearBaseline}
            onJumpToday={jumpToday}
            railCollapsed={ui.railCollapsed}
            onRailCollapsed={ui.setRailCollapsed}
          />
        }
      />

      <TimelineRenderer
        project={project}
        tasks={tasks}
        sections={sections}
        users={users}
        tags={tags}
        zoom={ui.zoom}
        panX={ui.panX}
        setPanX={ui.setPanX}
        onZoomIn={ui.zoomIn}
        onZoomOut={ui.zoomOut}
        colorBy={ui.colorBy}
        rowsBy={ui.rowsBy}
        autoShift={ui.autoShift}
        highlightCriticalPath={ui.highlightCriticalPath}
        showBaseline={ui.showBaseline}
        baseline={ui.baseline}
        railWidth={ui.railWidth}
        railCollapsed={ui.railCollapsed}
        collapsedSections={ui.collapsedSet}
        onToggleSection={ui.toggleSection}
        actorId={currentUserId}
        onOpenTask={openTask}
        onLinkError={setLinkError}
      />
    </div>
  )
}
