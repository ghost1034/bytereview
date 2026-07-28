'use client'

/**
 * useListViewData — memoized query, grouping, and flat rows for ListView.
 */
import { useCallback, useMemo, useState } from 'react'
import type { Project, Task } from '../../../types'
import {
  useCustomFieldsStore,
  useProjectsStore,
  useSectionsStore,
  useTagsStore,
  useTasksStore,
  useUsersStore,
} from '../../../stores/entities'
import {
  DEFAULT_COLUMNS_SNAPSHOT,
  columnGridMinWidth,
  columnGridTemplate,
  columnsStorageKey,
  useColumnsStore,
} from '../../../stores/columns'
import { useViewQuery, selectGroupedTasks, viewQueryMemoKey } from '../../query'
import { useProjectFields } from '../../custom-fields'
import { getChildren } from '../../tasks'
import { buildListRows, orderTasksInSection } from './listUtils'
import type { ListRow } from './listTypes'

export function useListViewData(project: Project, currentUserId: string | null) {
  const allTasks = useTasksStore((s) => s.list())
  const sections = useSectionsStore((s) =>
    s.list().filter((sec) => sec.projectId === project.id).sort((a, b) => a.order - b.order)
  )
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === project.workspaceId))
  const allProjects = useProjectsStore((s) => s.list())
  const customFieldMap = useCustomFieldsStore((s) => s.items)
  const { query, setQuery, patchQuery } = useViewQuery(project.id, 'list')
  const columnsKey = columnsStorageKey(currentUserId, project.id)
  const columns = useColumnsStore((s) => s.byKey[columnsKey] ?? DEFAULT_COLUMNS_SNAPSHOT)
  const { fields: projectFields } = useProjectFields(project)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [activeAddGroups, setActiveAddGroups] = useState<Set<string>>(new Set())

  const members = useMemo(
    () => project.memberIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users,
    [project.memberIds, users]
  )

  const gridTemplate = useMemo(() => columnGridTemplate(columns), [columns])
  const gridMinWidth = useMemo(() => columnGridMinWidth(columns), [columns])
  const effectiveGroupBy = query.groupBy ?? 'section'
  const groupBySection = effectiveGroupBy === 'section'
  const collapsedIds = useMemo(() => new Set(query.collapsedSectionIds ?? []), [query.collapsedSectionIds])

  const queryCtx = useMemo(
    () => ({
      projectId: project.id,
      currentUserId,
      sections,
      users,
      tags,
      customFields: projectFields,
      projects: allProjects,
    }),
    [allProjects, currentUserId, project.id, projectFields, sections, tags, users]
  )

  const queryKey = viewQueryMemoKey(query)
  const rootTasks = useMemo(
    () => allTasks.filter((t) => t.projectIds.includes(project.id) && !t.parentId),
    [allTasks, project.id]
  )

  const { groups } = useMemo(
    () => selectGroupedTasks(rootTasks, { ...query, groupBy: effectiveGroupBy }, queryCtx),
    [effectiveGroupBy, query, queryCtx, queryKey, rootTasks]
  )

  const tasksByGroup = useMemo(() => {
    const map = new Map<string, Task[]>()
    groups.forEach((g) => {
      const order = groupBySection ? project.taskOrderBySection?.[g.key] : undefined
      map.set(g.key, orderTasksInSection(g.tasks, order))
    })
    return map
  }, [groupBySection, groups, project.taskOrderBySection])

  const getChildTasks = useCallback((parentId: string) => getChildren(parentId, allTasks), [allTasks])

  const rows: ListRow[] = useMemo(
    () =>
      buildListRows({
        groups,
        sections,
        groupBySection,
        collapsedIds,
        expandedTaskIds,
        project,
        allTasks,
        getChildren: getChildTasks,
      }),
    [allTasks, collapsedIds, expandedTaskIds, getChildTasks, groupBySection, groups, project, sections]
  )

  const flatTaskIds = useMemo(
    () => rows.filter((r) => r.kind === 'task').map((r) => (r.kind === 'task' ? r.task.id : '')),
    [rows]
  )

  const sortableIds = useMemo(
    () => [...sections.map((s) => `section:${s.id}`), ...flatTaskIds],
    [flatTaskIds, sections]
  )

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const activateAddGroup = useCallback((groupKey: string) => {
    setActiveAddGroups((prev) => new Set(prev).add(groupKey))
  }, [])

  const deactivateAddGroup = useCallback((groupKey: string) => {
    setActiveAddGroups((prev) => {
      const next = new Set(prev)
      next.delete(groupKey)
      return next
    })
  }, [])

  return {
    query,
    setQuery,
    patchQuery,
    columns,
    gridTemplate,
    gridMinWidth,
    groupBySection,
    sections,
    allTasks,
    users,
    members,
    tags,
    allProjects,
    projectFields,
    customFieldMap,
    rows,
    flatTaskIds,
    sortableIds,
    tasksByGroup,
    expandedTaskIds,
    activeAddGroups,
    toggleExpand,
    activateAddGroup,
    deactivateAddGroup,
  }
}
