'use client'

/**
 * CalendarView — month/week grid with drag-to-reschedule and unscheduled drawer.
 */
import { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useAuthStore } from '../../../stores/auth'
import {
  useCustomFieldsStore,
  useSectionsStore,
  useTagsStore,
  useTasksStore,
  useUsersStore,
} from '../../../stores/entities'
import { applyViewQuery } from '../../../lib/query/applyQuery'
import { QueryToolbar, useViewQuery } from '../../query'
import { CalendarToolbar } from './CalendarToolbar'
import { CalendarUnscheduledDrawer } from './CalendarUnscheduledDrawer'
import { MonthGrid } from './MonthGrid'
import { WeekGrid } from './WeekGrid'
import type { CalendarMode } from './calendarUtils'
import { useCalendarDnd } from './useCalendarDnd'
import { useOpenProjectTask } from '../../tasks/useTaskDetailUrl'

type Props = { project: Project; basePath: string }

export function CalendarView({ project, basePath }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const openTask = useOpenProjectTask(basePath, 'calendar')
  const { query, setQuery } = useViewQuery(project.id, 'calendar')
  const [cursor, setCursor] = useState(() => new Date())
  const [mode, setMode] = useState<CalendarMode>('month')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showWeekends, setShowWeekends] = useState(true)

  const allTasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === project.workspaceId))
  const sections = useSectionsStore((s) =>
    s.list().filter((sec) => sec.projectId === project.id)
  )
  const customFields = useCustomFieldsStore((s) => s.list())

  const tasks = useMemo(() => {
    const projectTasks = allTasks.filter(
      (t) => t.projectIds.includes(project.id) && !t.parentId && t.dueOn
    )
    return applyViewQuery(projectTasks, query, project.id, currentUserId)
  }, [allTasks, currentUserId, project.id, query])

  const hasDatedTasks = tasks.length > 0
  const { onDragStart, onDragEnd, dropOnDay } = useCalendarDnd({ currentUserId })

  const handleDrop = (e: React.DragEvent, key: string) => {
    void dropOnDay(e, key, allTasks)
    onDragEnd()
  }

  return (
    <div className={drawerOpen ? 'pr-80' : undefined}>
      <QueryToolbar
        query={query}
        onChange={setQuery}
        projectId={project.id}
        viewType="calendar"
        customFields={customFields}
        members={users}
        sections={sections}
        tags={tags}
      />

      <CalendarToolbar
        cursor={cursor}
        mode={mode}
        showWeekends={showWeekends}
        onCursorChange={setCursor}
        onModeChange={setMode}
        onShowWeekendsChange={setShowWeekends}
        drawerToggle={
          <CalendarUnscheduledDrawer
            project={project}
            basePath={basePath}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onDragStart={onDragStart}
            onOpenTask={openTask}
          />
        }
      />

      {!hasDatedTasks ? (
        <p className="mb-4 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
          Drag tasks from the unscheduled drawer or click a day to add one.
        </p>
      ) : null}

      {mode === 'month' ? (
        <MonthGrid
          cursor={cursor}
          project={project}
          tasks={tasks}
          showWeekends={showWeekends}
          onOpenTask={openTask}
          onDragStart={onDragStart}
          onDrop={handleDrop}
        />
      ) : (
        <WeekGrid
          cursor={cursor}
          project={project}
          tasks={tasks}
          showWeekends={showWeekends}
          onOpenTask={openTask}
          onDragStart={onDragStart}
          onDrop={handleDrop}
        />
      )}
    </div>
  )
}
