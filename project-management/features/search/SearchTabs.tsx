'use client'

/**
 * Search result type tabs — All, Tasks, Projects.
 */
import { FolderKanban, LayoutGrid, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SearchTab = 'all' | 'tasks' | 'projects'

type Props = {
  tab: SearchTab
  onChange: (tab: SearchTab) => void
  taskCount?: number
  projectCount?: number
}

const TABS: Array<{ id: SearchTab; label: string; icon: typeof ListTodo }> = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
]

export function SearchTabs({ tab, onChange, taskCount, projectCount }: Props) {
  return (
    <div className="inline-flex rounded-xl border p-1" style={{ borderColor: 'var(--border-subtle)' }}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const count = id === 'tasks' ? taskCount : id === 'projects' ? projectCount : undefined
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
              tab === id ? 'shadow-paper-sm' : 'hover:opacity-90'
            )}
            style={
              tab === id
                ? { background: 'var(--primary-soft)', color: 'var(--primary)' }
                : { color: 'var(--ink-secondary)' }
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {count !== undefined ? (
              <span className="text-xs opacity-80">({count})</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
