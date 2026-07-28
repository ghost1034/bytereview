'use client'

/**
 * Sticky left rail — task names grouped by section or swimlane.
 */
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { Task, User } from '../../../types'
import { CRITICAL_PATH_COLOR, CRITICAL_PATH_GLOW, HEADER_H, ROW_H } from './constants'
import type { TimelineRow } from './types'

type Props = {
  rows: TimelineRow[]
  width: number
  users: User[]
  criticalIds: Set<string>
  highlightCriticalPath: boolean
  onOpenTask: (id: string) => void
  onToggleSection?: (sectionId: string) => void
  collapsedSections: Set<string>
  onAddDate: (taskId: string) => void
}

export function TimelineLeftRail({
  rows,
  width,
  users,
  criticalIds,
  highlightCriticalPath,
  onOpenTask,
  onToggleSection,
  collapsedSections,
  onAddDate,
}: Props) {
  return (
    <div
      className="sticky left-0 z-20 shrink-0 border-r"
      style={{ width, borderColor: 'var(--border-subtle)', background: 'var(--bg-muted)' }}
    >
      <div
        className="border-b px-3 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          height: HEADER_H,
          lineHeight: `${HEADER_H}px`,
          color: 'var(--ink-muted)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        Task
      </div>
      {rows.map((row) => {
        if (row.kind === 'section') {
          const collapsed = collapsedSections.has(row.sectionId)
          return (
            <button
              key={`sec-${row.sectionId}`}
              type="button"
              className="flex w-full items-center gap-1 truncate border-b px-2 text-left text-xs font-semibold uppercase"
              style={{
                height: ROW_H,
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--ink-muted)',
              }}
              onClick={() => onToggleSection?.(row.sectionId)}
            >
              {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {row.label}
            </button>
          )
        }
        if (row.kind === 'swimlane') {
          return (
            <div
              key={`lane-${row.key}`}
              className="truncate border-b px-3 text-xs font-semibold"
              style={{
                height: ROW_H,
                lineHeight: `${ROW_H}px`,
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--ink-muted)',
              }}
            >
              {row.label}
            </div>
          )
        }

        const task = row.task
        const hasDates = Boolean(task.startOn || task.dueOn)
        const critical = highlightCriticalPath && criticalIds.has(task.id)

        return (
          <div
            key={task.id}
            className="flex items-center gap-1 border-b px-2 text-sm"
            style={{
              height: ROW_H,
              borderColor: 'var(--border-subtle)',
              background: critical ? 'color-mix(in srgb, var(--bg-muted) 88%, rgba(229,57,53,0.12))' : undefined,
            }}
          >
            {critical ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1"
                style={{
                  background: CRITICAL_PATH_COLOR,
                  boxShadow: `0 0 5px ${CRITICAL_PATH_GLOW}`,
                  borderColor: '#ffffff',
                }}
                title="Critical path"
                aria-hidden
              />
            ) : (
              <span className="h-2.5 w-2.5 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left hover:opacity-90"
              style={critical ? { fontWeight: 600, color: CRITICAL_PATH_COLOR } : undefined}
              onClick={() => onOpenTask(task.id)}
            >
              {(task.dependencyIds.length > 0 || task.dependentIds.length > 0) && (
                <span className="mr-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                  ↳
                </span>
              )}
              {task.name}
            </button>
            {!hasDates ? (
              <button
                type="button"
                className="shrink-0 text-[10px] font-medium"
                style={{ color: 'var(--primary)' }}
                onClick={() => onAddDate(task.id)}
              >
                <Plus className="mr-0.5 inline h-3 w-3" />
                Add date
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
