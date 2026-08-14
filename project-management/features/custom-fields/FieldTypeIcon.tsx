'use client'

/** Icon hint for a custom field type (list column headers). */
import {
  Calculator,
  Calendar,
  CheckSquare,
  Hash,
  List,
  ListChecks,
  Type,
  Users,
} from 'lucide-react'
import type { CustomFieldType } from '../../types'

type Props = { type: CustomFieldType; className?: string }

export function FieldTypeIcon({ type, className = 'h-3.5 w-3.5' }: Props) {
  const props = { className, style: { color: 'hsl(var(--foreground-muted))' } as const }
  switch (type) {
    case 'text':
      return <Type {...props} />
    case 'number':
      return <Hash {...props} />
    case 'date':
      return <Calendar {...props} />
    case 'people':
      return <Users {...props} />
    case 'dropdown':
      return <List {...props} />
    case 'multi_select':
      return <ListChecks {...props} />
    case 'checkbox':
      return <CheckSquare {...props} />
    case 'formula':
      return <Calculator {...props} />
  }
}
