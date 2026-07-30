'use client'

/**
 * MyTasksHeader — title, view mode tabs, and customize entry.
 */
import Link from 'next/link'
import type { MyTasksLayout, MyTasksViewMode } from './types'
import { MyTasksCustomizeDrawer } from './MyTasksCustomizeDrawer'

const VIEW_TABS: { id: MyTasksViewMode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'board', label: 'Board' },
  { id: 'calendar', label: 'Calendar' },
]

type Props = {
  workspaceId: string
  userId: string
  viewMode: MyTasksViewMode
  layout: MyTasksLayout
  onUpdateLayout: (layout: MyTasksLayout) => Promise<void>
}

/** Page header with view switcher for My Tasks. */
export function MyTasksHeader({ workspaceId, userId, viewMode, layout, onUpdateLayout }: Props) {
  const base = `/dashboard/project-management/w/${workspaceId}/my-tasks`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">My Tasks</h1>
        <MyTasksCustomizeDrawer
          workspaceId={workspaceId}
          userId={userId}
          layout={layout}
          onUpdate={onUpdateLayout}
        />
      </div>
      <nav className="flex flex-wrap gap-4 border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
        {VIEW_TABS.map((tab) => {
          const href = tab.id === 'list' ? base : `${base}?view=${tab.id}`
          const active = viewMode === tab.id
          return (
            <Link
              key={tab.id}
              href={href}
              className="relative pb-2 text-sm font-medium transition-colors"
              style={{ color: active ? 'var(--primary)' : 'var(--ink-secondary)' }}
            >
              {tab.label}
              {active ? (
                <span
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                  style={{ background: 'var(--primary)' }}
                />
              ) : null}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
