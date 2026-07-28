'use client'

/**
 * MyTasksCalendar — calendar of assigned tasks across all projects.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QueryToolbar } from '../query'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useProjectsStore, useTagsStore, useUsersStore } from '../../stores/entities'
import { applyViewQuery } from '../../lib/query/applyQuery'
import { CalendarToolbar } from '../views/calendar/CalendarToolbar'
import { MonthGrid } from '../views/calendar/MonthGrid'
import { WeekGrid } from '../views/calendar/WeekGrid'
import type { CalendarMode } from '../views/calendar/calendarUtils'
import { useCalendarDnd } from '../views/calendar/useCalendarDnd'
import { MyTasksQuickFilters } from './MyTasksQuickFilters'
import { MyTasksUnscheduledDrawer } from './MyTasksUnscheduledDrawer'
import { useMyTasksSelector } from './useMyTasksSelector'

type Props = { workspaceId: string; basePath: string }

/** Calendar view pre-filtered to my assigned tasks. */
export function MyTasksCalendar({ workspaceId, basePath }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const customFields = useCustomFieldsStore((s) => s.list().filter((f) => f.workspaceId === workspaceId))
  const allProjects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const { tasks, projects, query, setQuery } = useMyTasksSelector({
    workspaceId,
    userId: currentUserId,
    viewMode: 'calendar',
  })
  const [cursor, setCursor] = useState(() => new Date())
  const [mode, setMode] = useState<CalendarMode>('month')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showWeekends, setShowWeekends] = useState(true)

  const calendarProject = allProjects[0]
  const datedTasks = useMemo(
    () => applyViewQuery(tasks.filter((t) => t.dueOn), query, { projectId: workspaceId, currentUserId, projects: allProjects }),
    [allProjects, currentUserId, projects, query, tasks, workspaceId]
  )
  const unscheduled = useMemo(() => tasks.filter((t) => !t.dueOn && !t.completed), [tasks])
  const { onDragStart, onDragEnd, dropOnDay } = useCalendarDnd({ currentUserId })
  const openTask = (taskId: string) => router.push(`${basePath}?task=${taskId}`)

  if (!calendarProject) {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
        Create a project to schedule tasks on the calendar.
      </p>
    )
  }

  const handleDrop = (e: React.DragEvent, key: string) => {
    void dropOnDay(e, key, tasks)
    onDragEnd()
  }

  return (
    <div className={drawerOpen ? 'pr-80' : undefined}>
      <QueryToolbar
        query={query}
        onChange={setQuery}
        showSavedViews={false}
        showGroupBy={false}
        showCustomize={false}
        customFields={customFields}
        members={users}
        tags={tags}
      />
      <MyTasksQuickFilters query={query} onChange={setQuery} projects={projects} />
      <CalendarToolbar
        cursor={cursor}
        mode={mode}
        showWeekends={showWeekends}
        onCursorChange={setCursor}
        onModeChange={setMode}
        onShowWeekendsChange={setShowWeekends}
        drawerToggle={
          <MyTasksUnscheduledDrawer
            tasks={unscheduled}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onDragStart={onDragStart}
            onOpenTask={openTask}
          />
        }
      />
      {mode === 'month' ? (
        <MonthGrid
          cursor={cursor}
          project={calendarProject}
          tasks={datedTasks}
          showWeekends={showWeekends}
          onOpenTask={openTask}
          onDragStart={onDragStart}
          onDrop={handleDrop}
        />
      ) : (
        <WeekGrid
          cursor={cursor}
          project={calendarProject}
          tasks={datedTasks}
          showWeekends={showWeekends}
          onOpenTask={openTask}
          onDragStart={onDragStart}
          onDrop={handleDrop}
        />
      )}
    </div>
  )
}
