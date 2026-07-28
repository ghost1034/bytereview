'use client'

/** Gallery card for a curated project template. */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CuratedProjectTemplate } from '../../lib/templates/types'
import { countTemplateTasks } from '../../lib/templates/templateLibrary'

type Props = {
  template: CuratedProjectTemplate
  loading: boolean
  onPreview: () => void
  onUse: () => void
}

export function TemplateCard({ template, loading, onPreview, onUse }: Props) {
  const taskCount = countTemplateTasks(template)
  const ruleCount = template.ruleTemplates?.length ?? 0

  return (
    <article className="tl-card flex h-full flex-col p-5 shadow-paper-sm">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="outline" className="text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
          {template.category}
        </Badge>
        {template.heavy ? (
          <Badge style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Heavy</Badge>
        ) : null}
      </div>
      <p className="mt-3 text-2xl">{template.iconEmoji}</p>
      <h2 className="mt-2 font-serif text-lg">{template.name}</h2>
      <p className="mt-1 flex-1 text-sm" style={{ color: 'var(--ink-muted)' }}>{template.description}</p>
      {template.heavy ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Heavy template — recommended for executive deal teams
        </p>
      ) : null}
      <p className="mt-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
        {template.sectionNames.length} sections · {taskCount} tasks · {ruleCount} rules
      </p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" onClick={onPreview}>Preview</Button>
        <Button size="sm" className="tl-btn-primary border-0" disabled={loading} onClick={onUse}>
          Use template
        </Button>
      </div>
    </article>
  )
}
