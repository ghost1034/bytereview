'use client'

/**
 * MyTasksSectionHeader — collapsible section header with count and inline add.
 */
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BuiltinMyTasksSectionId, MyTasksSectionId } from './types'
import { SECTION_EMPTY_MESSAGES } from './types'
import { isBuiltinSectionId } from './myTasksUtils'

type Props = {
  sectionId: MyTasksSectionId
  label: string
  count: number
  collapsed: boolean
  onToggleCollapse: () => void
  onAddTask: () => void
}

/** Section header for My Tasks list view. */
export function MyTasksSectionHeader({
  sectionId,
  label,
  count,
  collapsed,
  onToggleCollapse,
  onAddTask,
}: Props) {
  const emptyMsg =
    isBuiltinSectionId(sectionId) ? SECTION_EMPTY_MESSAGES[sectionId as BuiltinMyTasksSectionId] : 'Nothing here yet.'

  return (
    <div className="flex items-center gap-2 py-2">
      <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? (
          <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
        )}
      </button>
      <h2 className="font-sans text-lg" style={{ color: 'hsl(var(--foreground))' }}>
        {label}
      </h2>
      <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {count}
      </span>
      <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={onAddTask}>
        <Plus className="h-4 w-4" />
      </Button>
      {count === 0 && !collapsed ? (
        <p className="ml-2 text-sm italic" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {emptyMsg}
        </p>
      ) : null}
    </div>
  )
}