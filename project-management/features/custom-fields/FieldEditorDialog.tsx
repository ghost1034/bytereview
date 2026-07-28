'use client'

/** FieldEditorDialog — create or edit workspace/project custom fields (all 8 types). */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createField, updateField } from '../../lib/customFields/customFieldActions'
import { useCustomFieldsStore } from '../../stores/entities'
import { useProjectFieldPrefsStore } from '../../stores/projectFieldPrefs'
import type { CustomField } from '../../types'
import {
  defaultEditorState,
  FieldEditorForm,
  stateToSavePayload,
  type FieldEditorState,
} from './FieldEditorForm'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  userId: string
  field?: CustomField
  projectId?: string
  defaultGlobal?: boolean
  onSaved?: (field: CustomField) => void
}

export function FieldEditorDialog({
  open,
  onOpenChange,
  workspaceId,
  userId,
  field,
  projectId,
  defaultGlobal = true,
  onSaved,
}: Props) {
  const [state, setState] = useState<FieldEditorState>(() => defaultEditorState(field, defaultGlobal))
  const [loading, setLoading] = useState(false)
  const allFields = useCustomFieldsStore((s) => s.list().filter((f) => f.workspaceId === workspaceId))

  const numberFields = useMemo(
    () => allFields.filter((f) => f.type === 'number' || f.type === 'checkbox' || f.type === 'formula'),
    [allFields]
  )

  useEffect(() => {
    if (!open) return
    setState(defaultEditorState(field, defaultGlobal))
  }, [defaultGlobal, field, open])

  const save = async () => {
    if (!state.name.trim()) return
    setLoading(true)
    try {
      const payload = stateToSavePayload(state, workspaceId, userId)
      let saved: CustomField
      if (field) {
        await updateField(field.id, payload)
        saved = { ...field, ...payload, name: payload.name }
      } else {
        saved = await createField(payload)
      }
      if (projectId && payload.showOnCard) {
        useProjectFieldPrefsStore.getState().setShowOnCard(projectId, saved.id, true)
      }
      onSaved?.(saved)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {field ? 'Edit field' : 'Create field'}
          </DialogTitle>
        </DialogHeader>
        <FieldEditorForm state={state} onChange={setState} numberFields={numberFields} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={loading || !state.name.trim()}>
            {field ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
