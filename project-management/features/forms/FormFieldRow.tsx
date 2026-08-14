'use client'

/** FormFieldRow — builder list row with reorder, duplicate, and delete controls. */
import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FormField } from '../../types'

type Props = {
  field: FormField
  index: number
  total: number
  selected: boolean
  isTitleField: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onRemove: () => void
}

const TYPE_LABELS: Record<FormField['type'], string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Single select',
  multi_select: 'Multi select',
  attachment: 'Attachment',
}

/** Single field row in the form builder field list. */
export function FormFieldRow({
  field,
  index,
  total,
  selected,
  isTitleField,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: Props) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer"
      style={{
        borderColor: selected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        background: selected ? 'hsl(var(--primary-soft))' : 'hsl(var(--card))',
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{field.label}</p>
        <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {TYPE_LABELS[field.type]}
          {field.required ? ' · Required' : ''}
          {isTitleField ? ' · Task title' : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={onMoveUp}>
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index >= total - 1} onClick={onMoveDown}>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
