'use client'

/**
 * SearchPage — workspace-wide advanced search for tasks and projects.
 */
import { useCallback, useMemo, useState } from 'react'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import {
  useCommentsStore,
  useCustomFieldsStore,
  useProjectsStore,
  useTagsStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import { useViewQueryStore } from '../../stores/viewQuery'
import { QueryToolbar } from '../query/QueryToolbar'
import { DEFAULT_VIEW_QUERY, applyViewQuery, type ViewQuery } from '../../lib/query/applyQuery'
import { searchWorkspaceProjects, searchWorkspaceTasks } from '../../lib/search/searchIndex'
import { SearchTabs, type SearchTab } from './SearchTabs'
import { SearchResultsList } from './SearchResultsList'
import { useSearchIndex } from './useSearchIndex'

export function SearchPage() {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const projects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list())
  const comments = useCommentsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())
  const recentSearches = useViewQueryStore((s) => (workspaceId ? s.getRecentSearches(workspaceId) : []))
  const addRecentSearch = useViewQueryStore((s) => s.addRecentSearch)

  const [query, setQuery] = useState<ViewQuery>({ ...DEFAULT_VIEW_QUERY })
  const [tab, setTab] = useState<SearchTab>('all')
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
    () => users.filter((u) => workspaceProjects.some((p) => p.memberIds.includes(u.id))),
    [users, workspaceProjects]
  )
  const workspaceCustomFields = useMemo(
    () => customFields.filter((f) => f.workspaceId === workspaceId),
    [customFields, workspaceId]
  )

  useSearchIndex(tasks, projects, comments)

  usePageMeta({
    breadcrumbs: workspaceId
      ? [
          { label: 'AI Productivity Suite', href: `${basePath}/home` },
          { label: 'Search' },
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

  const isActiveQuery = Boolean(query.search.trim()) || query.filters.length > 0
  const hasResults = isActiveQuery && (taskResults.length > 0 || projectResults.length > 0)
  const recentSuggestions = recentSearches.slice(0, 5)

  if (!workspaceId) {
    return <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Select a workspace to search.</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Search</h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Find tasks and projects across this workspace with filters and saved views.
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
        />
        <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
      </div>

      {isActiveQuery ? (
        <SearchResultsList
          tab={tab}
          query={query.search}
          basePath={basePath}
          taskRows={taskResults}
          projectRows={projectResults}
          users={workspaceMembers}
          projects={workspaceProjects}
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
