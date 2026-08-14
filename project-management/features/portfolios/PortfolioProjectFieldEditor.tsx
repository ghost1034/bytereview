'use client'

/** PortfolioProjectFieldEditor — inline edit of portfolio-scoped CF values. */
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CustomField, CustomFieldValue } from '../../types'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { getPortfolioProjectFieldValue, setPortfolioProjectFieldValue } from '../../lib/portfolios/fieldValues'
import { defaultValueForField } from '../../lib/customFields/fieldValues'
import { FieldEditorBody } from '../custom-fields/FieldEditorBody'
import { FieldValueCell } from '../custom-fields/FieldValueCell'

type Props = {
  portfolioId: string
  projectId: string
  field: CustomField
  className?: string
}

export function PortfolioProjectFieldEditor({ portfolioId, projectId, field, className }: Props) {
  const users = useUsersStore((s) => s.list())
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(false)
  const stored = getPortfolioProjectFieldValue(portfolioId, projectId, field.id)
  const value = stored ?? defaultValueForField(field)

  const save = async (next: CustomFieldValue) => {
    if (!currentUserId) return
    await setPortfolioProjectFieldValue(portfolioId, projectId, field.id, next)
    setOpen(false)
  }

  if (field.type === 'formula') {
    return <FieldValueCell field={field} value={value} users={users} className={className} />
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`min-w-0 text-left ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
          <FieldValueCell field={field} value={stored} users={users} className={className} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <FieldEditorBody field={field} value={value} users={users} onSave={(v) => void save(v)} />
      </PopoverContent>
    </Popover>
  )
}
