'use client'

/** FieldValueEditor — popover-based inline editors per custom field type. */
import { useState } from 'react'
import { PopoverContent, Popover, PopoverTrigger } from '@/components/ui/popover'
import type { CustomField, CustomFieldValue, Task } from '../../types'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { setTaskFieldValue } from '../../lib/customFields/customFieldActions'
import { getTaskFieldValue } from '../../lib/customFields/fieldValues'
import { FieldEditorBody } from './FieldEditorBody'
import { FieldValueCell } from './FieldValueCell'
import { useTaskProjectFields } from './useProjectFields'

type Props = {
  task: Task
  field: CustomField
  allFields?: CustomField[]
  compact?: boolean
  className?: string
}

export function FieldValueEditor({ task, field, allFields, compact, className }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const [open, setOpen] = useState(false)
  const taskFields = useTaskProjectFields(task.projectIds)
  const fields = allFields ?? taskFields
  const value = getTaskFieldValue(task, field, fields)

  const save = async (next: CustomFieldValue) => {
    if (!currentUserId) return
    await setTaskFieldValue(task, field, next, currentUserId, fields)
    setOpen(false)
  }

  if (field.type === 'formula') {
    return (
      <FieldValueCell field={field} value={value} task={task} allFields={fields} users={users} className={className} />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`min-w-0 text-left ${compact ? 'w-full truncate' : ''} ${className ?? ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <FieldValueCell field={field} value={value} users={users} className={className} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <FieldEditorBody field={field} value={value} users={users} onSave={(v) => void save(v)} />
      </PopoverContent>
    </Popover>
  )
}
