'use client'

import type { ProjectView } from '../../types'
import { PROJECT_VIEWS, VIEW_LABELS } from './projectUtils'

type Props = {
  defaultView: ProjectView
  enabledViews: ProjectView[]
  onDefaultChange: (view: ProjectView) => void
  onEnabledChange: (views: ProjectView[]) => void
}

function ViewPreview({ kind }: { kind: ProjectView }) {
  const bars = kind === 'list' ? 4 : kind === 'board' ? 3 : 2
  return (
    <svg viewBox="0 0 48 32" className="h-8 w-12" aria-hidden>
      <rect x="2" y="2" width="44" height="28" rx="4" fill="hsl(var(--surface-muted))" />
      {kind === 'board' &&
        [0, 1, 2].map((i) => (
          <rect key={i} x={6 + i * 14} y="8" width="10" height="16" rx="2" fill="hsl(var(--primary-soft))" />
        ))}
      {kind === 'calendar' && (
        <>
          <rect x="8" y="8" width="32" height="6" rx="2" fill="hsl(var(--border))" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={8 + (i % 3) * 11} y={16 + Math.floor(i / 3) * 7} width="8" height="5" rx="1" fill="hsl(var(--success-soft))" />
          ))}
        </>
      )}
      {kind === 'timeline' && (
        <>
          <line x1="8" y1="22" x2="40" y2="22" stroke="hsl(var(--border))" />
          {[10, 22, 34].map((x) => (
            <circle key={x} cx={x} cy="22" r="3" fill="hsl(var(--primary))" />
          ))}
        </>
      )}
      {kind === 'gantt' && (
        <>
          <rect x="8" y="10" width="20" height="4" rx="2" fill="hsl(var(--primary-soft))" />
          <rect x="14" y="18" width="24" height="4" rx="2" fill="hsl(var(--success-soft))" />
        </>
      )}
      {kind === 'list' &&
        Array.from({ length: bars }).map((_, i) => (
          <rect key={i} x="8" y={8 + i * 5} width={28 - i * 4} height="3" rx="1.5" fill="hsl(var(--primary-soft))" />
        ))}
    </svg>
  )
}

/** Default view picker with enabled-view toggles. */
export function ProjectViewCards({ defaultView, enabledViews, onDefaultChange, onEnabledChange }: Props) {
  const toggleEnabled = (view: ProjectView) => {
    const next = enabledViews.includes(view)
      ? enabledViews.filter((v) => v !== view)
      : [...enabledViews, view]
    if (next.length === 0) return
    onEnabledChange(next)
    if (!next.includes(defaultView)) onDefaultChange(next[0])
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PROJECT_VIEWS.map((view) => {
        const enabled = enabledViews.includes(view)
        const isDefault = defaultView === view
        return (
          <div
            key={view}
            className="tl-card p-3 shadow-sm"
            style={{ opacity: enabled ? 1 : 0.55 }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() => onDefaultChange(view)}
            >
              <ViewPreview kind={view} />
              <div>
                <p className="font-medium">{VIEW_LABELS[view]}</p>
                {isDefault && (
                  <p className="text-xs" style={{ color: 'hsl(var(--primary))' }}>Default view</p>
                )}
              </div>
            </button>
            <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => toggleEnabled(view)}
              />
              Enabled
            </label>
          </div>
        )
      })}
    </div>
  )
}
