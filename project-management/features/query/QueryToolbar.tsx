'use client'

/**
 * QueryToolbar — shared filter/sort/group/search bar for project views and search.
 */
import { useEffect, useRef } from 'react'
import { Filter, RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CustomField, ProjectView, Section, Tag, User } from '../../types'
import { DEFAULT_VIEW_QUERY, isQueryModified, type ViewQuery } from '../../lib/query/applyQuery'
import { FilterBuilderPopover } from './FilterBuilderPopover'
import { SortMenu } from './SortMenu'
import { GroupByMenu } from './GroupByMenu'
import { CustomizeMenu } from './CustomizeMenu'
import { ShowCompletedToggle } from './ShowCompletedToggle'
import { SavedViewsMenu } from './SavedViewsMenu'

type Props = {
  query: ViewQuery
  onChange: (q: ViewQuery) => void
  projectId?: string
  viewType?: ProjectView
  showSavedViews?: boolean
  customFields?: CustomField[]
  members?: User[]
  sections?: Section[]
  tags?: Tag[]
  /** Large search input for the Advanced Search page. */
  searchVariant?: 'inline' | 'hero'
  showGroupBy?: boolean
  showCustomize?: boolean
  onSearchSubmit?: (q: string) => void
}

export function QueryToolbar({
  query,
  onChange,
  projectId,
  viewType = 'list',
  showSavedViews = true,
  customFields = [],
  members = [],
  sections = [],
  tags = [],
  searchVariant = 'inline',
  showGroupBy = true,
  showCustomize = true,
  onSearchSubmit,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null)
  const modified = isQueryModified(query)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reset = () => onChange({ ...DEFAULT_VIEW_QUERY, search: query.search })

  const searchInput =
    searchVariant === 'hero' ? (
      <div className="relative w-full">
        <Search className="absolute left-3 top-3 h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
        <Input
          ref={searchRef}
          value={query.search}
          onChange={(e) => onChange({ ...query, search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearchSubmit?.(query.search)
          }}
          placeholder="Search tasks and projects… (press / to focus)"
          className="h-12 pl-10 text-base"
        />
      </div>
    ) : (
      <div className="relative min-w-[180px] flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
        <input
          ref={searchRef}
          value={query.search}
          onChange={(e) => onChange({ ...query, search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearchSubmit?.(query.search)
          }}
          placeholder="Search tasks… (/)"
          className="tl-input h-9 w-full pl-9 text-sm"
        />
      </div>
    )

  return (
    <div className={searchVariant === 'hero' ? 'space-y-3' : 'mb-3 flex flex-wrap items-center gap-2'}>
      {searchInput}

      <div className="flex flex-wrap items-center gap-2">
        <FilterBuilderPopover
          filters={query.filters}
          onChange={(filters) => onChange({ ...query, filters })}
          customFields={customFields}
          members={members}
          sections={sections}
          tags={tags}
          trigger={
            <Button variant="outline" size="sm">
              <Filter className="mr-1 h-4 w-4" />
              Filter {query.filters.length ? `(${query.filters.length})` : ''}
            </Button>
          }
        />

        <SortMenu query={query} onChange={onChange} customFields={customFields} />
        {showGroupBy ? <GroupByMenu query={query} onChange={onChange} customFields={customFields} /> : null}
        <ShowCompletedToggle query={query} onChange={onChange} />
        {showCustomize ? <CustomizeMenu query={query} onChange={onChange} /> : null}

        {showSavedViews && projectId ? (
          <SavedViewsMenu
            projectId={projectId}
            viewType={viewType}
            query={query}
            onChange={onChange}
          />
        ) : null}

        {modified ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        ) : null}
      </div>
    </div>
  )
}
