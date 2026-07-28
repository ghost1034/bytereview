'use client'

/**
 * MyTasksQuickFilters — toolbar chips for common My Tasks filters.
 */
import { Button } from '@/components/ui/button'
import type { Project } from '../../types'
import type { FilterClause } from '../../lib/query/types'
import { isQuickFilterActive, toggleQuickFilter, quickFiltersConfig } from '../query/quickFiltersConfig'
import type { ViewQuery } from '../../lib/query/applyQuery'

type Props = {
  query: ViewQuery
  onChange: (q: ViewQuery) => void
  projects: Project[]
}

const MY_QUICK_IDS = new Set(['overdue', 'due_week', 'incomplete'])

/** Quick-toggle chips scoped to My Tasks. */
export function MyTasksQuickFilters({ query, onChange, projects }: Props) {
  const presets = quickFiltersConfig.filter((p) => MY_QUICK_IDS.has(p.id) || p.id === 'my_tasks')

  const toggleHasDue = () => {
    const clause: FilterClause = { field: 'dueOn', op: 'is_not_empty', value: true }
    const exists = query.filters.some((f) => f.field === 'dueOn' && f.op === 'is_not_empty')
    const filters = exists
      ? query.filters.filter((f) => !(f.field === 'dueOn' && f.op === 'is_not_empty'))
      : [...query.filters, clause]
    onChange({ ...query, filters })
  }

  const hasDue = query.filters.some((f) => f.field === 'dueOn' && f.op === 'is_not_empty')
  const projectFilter = query.filters.find((f) => f.field === 'projectId' && f.op === 'eq')

  const toggleProject = (projectId: string) => {
    const exists = projectFilter?.value === projectId
    const filters = exists
      ? query.filters.filter((f) => !(f.field === 'projectId' && f.op === 'eq'))
      : [
          ...query.filters.filter((f) => f.field !== 'projectId'),
          { field: 'projectId', op: 'eq' as const, value: projectId },
        ]
    onChange({ ...query, filters })
  }

  const toggleCompleted = () => {
    const hidden = query.hiddenCompleted ?? !query.showCompleted
    onChange({ ...query, hiddenCompleted: !hidden, showCompleted: hidden })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => {
        const active = isQuickFilterActive(query.filters, preset)
        return (
          <Button
            key={preset.id}
            variant={active ? 'default' : 'outline'}
            size="sm"
            className="h-7 rounded-full text-xs"
            onClick={() => onChange({ ...query, filters: toggleQuickFilter(query.filters, preset) })}
          >
            {preset.label}
          </Button>
        )
      })}
      <Button
        variant={hasDue ? 'default' : 'outline'}
        size="sm"
        className="h-7 rounded-full text-xs"
        onClick={toggleHasDue}
      >
        Has due date
      </Button>
      <Button
        variant={query.hiddenCompleted !== false ? 'default' : 'outline'}
        size="sm"
        className="h-7 rounded-full text-xs"
        onClick={toggleCompleted}
      >
        {query.hiddenCompleted !== false ? 'Hide completed' : 'Show completed'}
      </Button>
      {projects.slice(0, 6).map((p) => (
        <Button
          key={p.id}
          variant={projectFilter?.value === p.id ? 'default' : 'outline'}
          size="sm"
          className="h-7 max-w-[140px] truncate rounded-full text-xs"
          onClick={() => toggleProject(p.id)}
          title={p.name}
        >
          {p.name}
        </Button>
      ))}
    </div>
  )
}
