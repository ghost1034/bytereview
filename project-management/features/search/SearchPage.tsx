'use client'

/**
 * SearchPage — workspace-wide advanced search for tasks and projects.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import {
  useCommentsStore,
  useCustomFieldsStore,
  useGoalsStore,
  useProjectsStore,
  useSavedViewsStore,
  useTagsStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import { useViewQueryStore } from '../../stores/viewQuery'
import { QueryToolbar } from '../query/QueryToolbar'
import { DEFAULT_VIEW_QUERY, applyViewQuery, clauseCount, migrateViewQuery, type ViewQuery } from '../../lib/query/applyQuery'
import { searchWorkspaceGoals, searchWorkspacePeople, searchWorkspaceProjects, searchWorkspaceTasks } from '../../lib/search/searchIndex'
import { SearchTabs, type SearchTab } from './SearchTabs'
import { SearchResultsList } from './SearchResultsList'
import { useSearchIndex } from './useSearchIndex'
import { SearchResultsBoard } from './SearchResultsBoard'
import { SearchResultsChart } from './SearchResultsChart'
import { SavedSearchControls } from './SavedSearchControls'
import { savedSearchLiveCount } from './SavedSearchesSidebarGroup'

type SearchView = 'list' | 'board' | 'chart'
const EMPTY_SEARCHES: string[] = []

export function SearchPage() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const savedSearchId = useSearchParams().get('saved')
  const projects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list())
  const comments = useCommentsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())
  const goals = useGoalsStore((s) => s.list())
  const savedViews = useSavedViewsStore((s) => s.list())
  const recentSearches = useViewQueryStore((s) => workspaceId ? s.recentSearchesByWorkspace[workspaceId] : undefined) ?? EMPTY_SEARCHES
  const addRecentSearch = useViewQueryStore((s) => s.addRecentSearch)

  const [query, setQuery] = useState<ViewQuery>({ ...DEFAULT_VIEW_QUERY })
  const [tab, setTab] = useState<SearchTab>('tasks')
  const [view, setView] = useState<SearchView>('list')
  const [includeArchived, setIncludeArchived] = useState(false)

  const basePath = workspaceId ? `/dashboard/project-management/w/${workspaceId}` : '/dashboard/project-management'
  const workspaceProjects = useMemo(
    () => projects.filter((p) => p.workspaceId === workspaceId),
    [projects, workspaceId]
  )
  const workspaceTasks = useMemo(
    () => tasks.filter((t) => t.workspaceId === workspaceId && !t.parentId),
    [tasks, workspaceId]
  )
  const workspaceMembers = useMemo(
    () => users.filter((u) => workspace?.memberIds.includes(u.id)),
    [users, workspace]
  )
  const workspaceCustomFields = useMemo(
    () => customFields.filter((f) => f.workspaceId === workspaceId),
    [customFields, workspaceId]
  )

  useSearchIndex(tasks, projects, comments)

  useEffect(() => {
    const saved = savedViews.find((item) => item.id === savedSearchId && item.ownerScope.type === 'search' && item.ownerScope.id === workspaceId)
    if (!saved) return
    setQuery(migrateViewQuery(saved.query ?? { ...DEFAULT_VIEW_QUERY, filters: saved.filters as ViewQuery['filters'], filterExpression: saved.filterExpression }))
    setView(saved.viewType === 'board' || saved.viewType === 'chart' ? saved.viewType : 'list')
  }, [savedSearchId, savedViews, workspaceId])

  usePageMeta({
    breadcrumbs: workspaceId
      ? [
          { label: 'AI Project Management', href: `${basePath}/home` },
          { label: 'My Searches' },
        ]
      : [],
  })

  const recordSearch = useCallback(
    (q: string) => {
      if (workspaceId && q.trim()) addRecentSearch(workspaceId, q.trim())
    },
    [addRecentSearch, workspaceId]
  )

  const taskResults = useMemo(() => {
    if (!workspaceId) return []
    const fallbackProjectId = workspaceTasks[0]?.projectIds[0] ?? ''
    const ctx = {
      projectId: fallbackProjectId,
      currentUserId,
      customFields: workspaceCustomFields,
      tags: tags.filter((t) => t.workspaceId === workspaceId),
      projects: workspaceProjects,
      users: workspaceMembers,
      forceShowCompleted: true,
    }
    let filtered = applyViewQuery(workspaceTasks, query, ctx)

    const searchHits =
      query.search.trim() ?
        searchWorkspaceTasks(query.search, workspaceId, tasks, projects, basePath, 200, comments)
      : []
    const snippetByTaskId = new Map(searchHits.map((h) => [h.id, h.snippet]))

    if (query.search.trim()) {
      const hitIds = new Set(searchHits.map((h) => h.id))
      filtered = filtered.filter((t) => hitIds.has(t.id))
    }

    return filtered.map((task) => ({ task, snippet: snippetByTaskId.get(task.id) }))
  }, [
    basePath,
    comments,
    currentUserId,
    projects,
    query,
    tags,
    tasks,
    workspaceCustomFields,
    workspaceId,
    workspaceMembers,
    workspaceProjects,
    workspaceTasks,
  ])

  const projectResults = useMemo(() => {
    if (!workspaceId) return []
    if (!query.search.trim()) {
      return workspaceProjects.filter((p) => includeArchived || !p.archived)
    }
    const hits = searchWorkspaceProjects(
      query.search,
      workspaceId,
      projects,
      basePath,
      100,
      includeArchived,
      tasks,
      comments
    )
    return hits
      .map((hit) => projects.find((p) => p.id === hit.id))
      .filter((p): p is NonNullable<typeof p> => !!p)
  }, [basePath, comments, includeArchived, projects, query.search, tasks, workspaceId, workspaceProjects])

  const goalResults = useMemo(
    () => workspaceId ? searchWorkspaceGoals(query.search, workspaceId, goals) : [],
    [goals, query.search, workspaceId]
  )
  const peopleResults = useMemo(
    () => searchWorkspacePeople(query.search, workspaceMembers.map((user) => user.id), workspaceMembers),
    [query.search, workspaceMembers]
  )
  const workspaceSearches = useMemo(
    () => savedViews.filter((saved) => saved.ownerScope.type === 'search' && saved.ownerScope.id === workspaceId && saved.ownership === 'workspace'),
    [savedViews, workspaceId]
  )

  const isActiveQuery = Boolean(query.search.trim()) || (query.filterExpression ? clauseCount(query.filterExpression) : query.filters.length) > 0
  const hasResults = isActiveQuery && (taskResults.length > 0 || projectResults.length > 0 || goalResults.length > 0 || peopleResults.length > 0)
  const recentSuggestions = recentSearches.slice(0, 5)

  if (!workspaceId) {
    return <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Select a workspace to search.</p>
  }

  return (
    <div className="space-y-4" data-tour-page="search">
      <div>
        <h1 className="font-serif text-2xl">My Searches</h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Find tasks, projects, goals, and people with recursive filters and saved searches.
        </p>
      </div>

      <QueryToolbar
        query={query}
        onChange={setQuery}
        showSavedViews={false}
        searchVariant="hero"
        showGroupBy={false}
        customFields={workspaceCustomFields}
        members={workspaceMembers}
        tags={tags.filter((t) => t.workspaceId === workspaceId)}
        onSearchSubmit={recordSearch}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchTabs
          tab={tab}
          onChange={setTab}
          taskCount={taskResults.length}
          projectCount={projectResults.length}
          goalCount={goalResults.length}
          peopleCount={peopleResults.length}
        />
        <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
        {currentUserId ? <SavedSearchControls workspaceId={workspaceId} userId={currentUserId} query={query} viewType={view} /> : null}
        {tab === 'tasks' ? <div className="ml-auto flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
          {(['list', 'board', 'chart'] as SearchView[]).map((mode) => <Button key={mode} variant={view === mode ? 'secondary' : 'ghost'} size="sm" className="h-7 capitalize" onClick={() => setView(mode)}>{mode}</Button>)}
        </div> : null}
      </div>

      {workspaceSearches.length ? <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-subtle)' }}><p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Pinned workspace searches</p><div className="flex flex-wrap gap-2">{workspaceSearches.map((saved) => <Button key={saved.id} variant="outline" size="sm" onClick={() => setQuery(migrateViewQuery(saved.query ?? { ...DEFAULT_VIEW_QUERY, filters: saved.filters as ViewQuery['filters'], filterExpression: saved.filterExpression }))}>{saved.name} ({savedSearchLiveCount(saved, workspaceTasks, currentUserId)})</Button>)}</div></div> : null}

      {isActiveQuery ? (
        tab === 'tasks' && view === 'board' ? <SearchResultsBoard tasks={taskResults.map((row) => row.task)} projects={workspaceProjects} />
        : tab === 'tasks' && view === 'chart' ? <SearchResultsChart tasks={taskResults.map((row) => row.task)} projects={workspaceProjects} />
        : <SearchResultsList
            tab={tab} query={query.search} basePath={basePath} taskRows={taskResults} projectRows={projectResults}
            goalRows={goalResults} peopleRows={peopleResults} users={workspaceMembers} projects={workspaceProjects}
            tags={tags.filter((t) => t.workspaceId === workspaceId)}
          />
      ) : (
        <div className="rounded-xl border px-6 py-12 text-center" style={{ borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            Type in the search box or add filters to find work across this workspace.
          </p>
          {recentSuggestions.length ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                Recent searches
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {recentSuggestions.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="rounded-full border px-3 py-1 text-sm hover:opacity-90"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-secondary)' }}
                    onClick={() => {
                      setQuery({ ...query, search: term })
                      recordSearch(term)
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {!hasResults && isActiveQuery ? (
        <div className="rounded-xl border px-6 py-8 text-center" style={{ borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            No results match your search.
          </p>
          {recentSuggestions.length ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {recentSuggestions.map((term) => (
                <button
                  key={term}
                  type="button"
                  className="rounded-full border px-3 py-1 text-sm"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-secondary)' }}
                  onClick={() => setQuery({ ...query, search: term })}
                >
                  Try: {term}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
