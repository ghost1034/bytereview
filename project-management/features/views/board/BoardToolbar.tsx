'use client'

/** BoardToolbar — density and swimlane controls for the Kanban board. */
import { LayoutGrid, Rows3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ViewQuery } from '../../../lib/query/applyQuery'

type Props = {
  query: ViewQuery
  onChange: (q: ViewQuery) => void
}

export function BoardToolbar({ query, onChange }: Props) {
  const density = query.density === 'compact' ? 'compact' : 'comfortable'
  const swimlanes = query.swimlaneBy === 'assignee' || (query.boardSwimlanes ?? false)

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Density
      </span>
      <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'hsl(var(--border))' }}>
        {(['compact', 'comfortable'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className="rounded-md px-2.5 py-1 text-xs capitalize"
            style={{
              background: density === d ? 'hsl(var(--primary-soft))' : 'transparent',
              color: density === d ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))',
            }}
            onClick={() => onChange({ ...query, density: d })}
          >
            {d}
          </button>
        ))}
      </div>
      <Button
        variant={swimlanes ? 'default' : 'outline'}
        size="sm"
        className="gap-1.5"
        onClick={() =>
          onChange({
            ...query,
            swimlaneBy: swimlanes ? undefined : 'assignee',
            boardSwimlanes: !swimlanes,
          })
        }
      >
        {swimlanes ? <Rows3 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        Swimlanes by assignee
      </Button>
    </div>
  )
}
