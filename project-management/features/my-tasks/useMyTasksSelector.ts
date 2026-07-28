'use client'

/**
 * useMyTasksSelector — tasks assigned to me, bucketed into personal sections.
 */
import { useMemo } from 'react'
import { applyViewQuery } from '../../lib/query/applyQuery'
import {
  useActivityStore,
  useProjectsStore,
  useTasksStore,
} from '../../stores/entities'
import type { Project, Task } from '../../types'
import { useMyTasksLayout } from './useMyTasksLayout'
import { useMyTasksQuery } from './useMyTasksQuery'
import type { MyTasksSection, MyTasksViewMode, TaskWithMyTasks } from './types'
import {
  buildAssignedAtMap,
  filterMyTasks,
  isBuiltinSectionId,
  resolveTaskSection,
  sectionLabel,
} from './myTasksUtils'

type Args = {
  workspaceId: string
  userId: string | null
  viewMode: MyTasksViewMode
}

type Result = {
  sections: MyTasksSection[]
  tasks: Task[]
  projects: Project[]
  projectById: Map<string, Project>
  assignedAtByTaskId: Map<string, string>
  layout: ReturnType<typeof useMyTasksLayout>['layout']
  query: ReturnType<typeof useMyTasksQuery>['query']
  setQuery: ReturnType<typeof useMyTasksQuery>['setQuery']
  patchQuery: ReturnType<typeof useMyTasksQuery>['patchQuery']
  updateLayout: ReturnType<typeof useMyTasksLayout>['updateLayout']
  showCompleted: boolean
}

/** Core selector for My Tasks hub data. */
export function useMyTasksSelector({ workspaceId, userId, viewMode }: Args): Result {
  const { layout, updateLayout } = useMyTasksLayout(workspaceId, userId)
  const { query, setQuery, patchQuery } = useMyTasksQuery(workspaceId, viewMode)
  const allTasks = useTasksStore((s) => s.list())
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId)
  )
  const activity = useActivityStore((s) => s.list())

  const showCompleted = query.hiddenCompleted !== undefined ? !query.hiddenCompleted : query.showCompleted

  const baseTasks = useMemo(() => {
    if (!userId) return []
    return filterMyTasks(
      allTasks,
      projects,
      workspaceId,
      userId,
      layout.showSubtasksWhenParentUnassigned !== false
    )
  }, [allTasks, layout.showSubtasksWhenParentUnassigned, projects, userId, workspaceId])

  const assignedAtByTaskId = useMemo(
    () => (userId ? buildAssignedAtMap(baseTasks, userId, activity) : new Map()),
    [activity, baseTasks, userId]
  )

  const tasks = useMemo(() => {
    if (!userId) return []
    return applyViewQuery(baseTasks, query, { projectId: workspaceId, currentUserId: userId, projects })
  }, [baseTasks, query, projects, userId, workspaceId])

  const sections = useMemo((): MyTasksSection[] => {
    if (!userId) return []
    const buckets = new Map<string, TaskWithMyTasks[]>()
    layout.sectionOrder.forEach((id) => buckets.set(id, []))

    tasks.forEach((task) => {
      const assignedAt = assignedAtByTaskId.get(task.id)
      const sectionId = resolveTaskSection(task as TaskWithMyTasks, userId, assignedAt, showCompleted)
      if (!sectionId || layout.hiddenSectionIds.includes(sectionId)) return
      const list = buckets.get(sectionId) ?? []
      list.push(task as TaskWithMyTasks)
      buckets.set(sectionId, list)
    })

    return layout.sectionOrder
      .filter((id) => !layout.hiddenSectionIds.includes(id))
      .map((id) => {
        const items = buckets.get(id) ?? []
        const sorted =
          id === 'recently_assigned'
            ? [...items].sort(
                (a, b) =>
                  (assignedAtByTaskId.get(b.id) ?? '').localeCompare(assignedAtByTaskId.get(a.id) ?? '')
              )
            : items
        return {
          id,
          label: sectionLabel(id, layout),
          tasks: sorted,
          builtin: isBuiltinSectionId(id),
        }
      })
  }, [assignedAtByTaskId, layout, showCompleted, tasks, userId])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  return {
    sections,
    tasks,
    projects: projects.filter((p) => !p.archived),
    projectById,
    assignedAtByTaskId,
    layout,
    query,
    setQuery,
    patchQuery,
    updateLayout,
    showCompleted,
  }
}
