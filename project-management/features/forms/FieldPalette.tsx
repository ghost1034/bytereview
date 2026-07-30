'use client'

/** FieldPalette — buttons to insert each FormField type into the builder. */
import { Button } from '@/components/ui/button'
import type { FormField } from '../../types'

const FIELD_TYPES: { type: FormField['type']; label: string }[] = [
  { type: 'short_text', label: 'Short text' },
  { type: 'long_text', label: 'Long text' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'dropdown', label: 'Single select' },
  { type: 'multi_select', label: 'Multi select' },
  { type: 'attachment', label: 'Attachment' },
]

type Props = { onAdd: (type: FormField['type']) => void }

/** Palette of draggable field type cards. */
export function FieldPalette({ onAdd }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
        Add field
      </p>
      <div className="grid gap-1.5">
        {FIELD_TYPES.map(({ type, label }) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-xs"
            onClick={() => onAdd(type)}
          >
            + {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
