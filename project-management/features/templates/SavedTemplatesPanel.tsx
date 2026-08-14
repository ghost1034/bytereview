'use client'

/** Saved workspace templates list with edit/delete. */
import { Button } from '@/components/ui/button'
import { deleteSavedTemplate } from '../../lib/templates/saveTemplate'
import { useTemplatesStore } from '../../stores/entities'
import type { ProjectTemplate } from '../../types'

type Props = {
  onEdit: (template: ProjectTemplate) => void
}

export function SavedTemplatesPanel({ onEdit }: Props) {
  const templates = useTemplatesStore((s) => s.list())

  if (!templates.length) {
    return (
      <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        No saved templates yet. Save a project as a template or create one below.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {templates.map((t) => (
        <li key={t.id} className="tl-card flex items-center justify-between p-4 shadow-sm">
          <div>
            <p className="font-medium">{t.iconEmoji ?? t.defaults.iconEmoji ?? '📋'} {t.name}</p>
            <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {t.sectionNames.length} sections · {t.taskTemplates.length} task templates
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onEdit(t)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => void deleteSavedTemplate(t.id)}>Delete</Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
