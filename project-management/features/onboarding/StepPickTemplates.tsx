'use client'

/** Step 3 — multi-select starter templates with industry recommendations. */
import { Badge } from '@/components/ui/badge'
import { getCuratedTemplateById } from '../../lib/templates/templateLibrary'
import { recommendedTemplatesForIndustries } from '../../lib/provisioning/industryRecommendations'
import { countTemplateTasks } from '../../lib/templates/templateLibrary'
import { MAX_TEMPLATE_SELECTIONS } from './constants'

type Props = {
  industries: string[]
  selectedIds: string[]
  onToggle: (templateId: string) => void
  onBrowseAll: () => void
}

export function StepPickTemplates({ industries, selectedIds, onToggle, onBrowseAll }: Props) {
  const recommended = recommendedTemplatesForIndustries(industries)
  const industryLabel =
    industries.length > 1 ? industries.join(', ') : (industries[0] || 'your team')
  const atTemplateMax = selectedIds.filter((id) => id !== 'blank').length >= MAX_TEMPLATE_SELECTIONS

  return (
    <div className="space-y-3 py-2">
      <p className="text-sm text-muted-foreground">
        Pick up to {MAX_TEMPLATE_SELECTIONS} starter projects — we recommend these for{' '}
        <strong>{industryLabel}</strong>
        {industries.length > 1 ? ` (${recommended.length} templates across your selections)` : ''}.
      </p>
      <div className="grid max-h-64 gap-2 overflow-y-auto">
        {recommended.map((id) => {
          const t = getCuratedTemplateById(id)
          if (!t) return null
          const selected = selectedIds.includes(t.id)
          const disabled = atTemplateMax && !selected
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(t.id)}
              className="tl-card flex items-start justify-between gap-3 p-3 text-left shadow-paper-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ outline: selected ? '2px solid #cc785c' : 'none' }}
            >
              <div>
                <p className="font-medium text-foreground">
                  {t.iconEmoji} {t.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.description} · {countTemplateTasks(t)} tasks
                </p>
              </div>
              {selected ? <Badge variant="secondary">Selected</Badge> : null}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onToggle('blank')}
          className="tl-card p-3 text-left shadow-paper-sm"
          style={{ outline: selectedIds.includes('blank') ? '2px solid #cc785c' : 'none' }}
        >
          <p className="font-medium text-foreground">Start blank</p>
          <p className="text-sm text-muted-foreground">
            Skip starter projects and explore on your own.
          </p>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedIds.filter((id) => id !== 'blank').length}/{MAX_TEMPLATE_SELECTIONS} projects selected
      </p>
      <button
        type="button"
        className="text-sm font-medium text-[#cc785c] underline"
        onClick={onBrowseAll}
      >
        See all templates
      </button>
    </div>
  )
}
