'use client'

/** CreateFormDialog — quick-create a new form with default fields. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { createFormField } from '../../lib/forms/formFieldFactory'
import { useFormsStore, useProjectsStore } from '../../stores/entities'
import type { Form } from '../../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  onCreated: (formId: string) => void
}

/** Dialog to create a new form linked to a project. */
export function CreateFormDialog({ open, onOpenChange, workspaceId, onCreated }: Props) {
  const addForm = useFormsStore((s) => s.add)
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setName('')
    setProjectId(projects[0]?.id ?? '')
  }

  const submit = async () => {
    if (!name.trim() || !projectId) return
    setLoading(true)
    try {
      const titleField = createFormField('short_text')
      titleField.label = 'Title'
      titleField.required = true
      const detailsField = createFormField('long_text')
      detailsField.label = 'Details'

      const form: Form = {
        id: newId(),
        projectId,
        name: name.trim(),
        fields: [titleField, detailsField],
        taskTitleFieldId: titleField.id,
        copyAnswersToDescription: true,
        isPublic: false,
        confirmationMessage: 'Thanks! Your request has been received.',
        createdAt: now(),
      }
      await addForm(form)
      reset()
      onOpenChange(false)
      onCreated(form.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="tl-dialog-surface max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New form</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="form-name">Form name</Label>
            <Input id="form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Request intake" className="tl-input" />
          </div>
          <div className="grid gap-2">
            <Label>Project</Label>
            <Select value={projectId || projects[0]?.id} onValueChange={setProjectId}>
              <SelectTrigger className="tl-input"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.iconEmoji ?? '📁'} {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading || !name.trim() || !projectId} onClick={() => void submit()}>
            Create form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
