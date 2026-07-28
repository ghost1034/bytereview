'use client'

/** Recommended chart templates panel inside chart builder. */
import type { ChartBuilderDraft } from '../../lib/reporting/types'
import { CHART_TEMPLATES } from '../../lib/reporting/templates'

type Props = {
  onPick: (draft: ChartBuilderDraft) => void
}

/** Curated starter charts from reporting templates. */
export function ChartTemplatesPanel({ onPick }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
        Start from template
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHART_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="rounded-lg border p-3 text-left transition-colors hover:bg-[var(--bg-muted)]"
            style={{ borderColor: 'var(--border-subtle)' }}
            onClick={() =>
              onPick({
                ...template.draft,
                filters: template.draft.filters,
                scope: template.draft.scope,
              })
            }
          >
            <p className="text-sm font-medium">{template.title}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
              {template.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
