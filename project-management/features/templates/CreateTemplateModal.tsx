'use client'

/** Create / edit a custom workspace template (minimal editor). */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogContent, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProjectTemplate } from '../../types'
import { useTemplatesStore } from '../../stores/entities'
import { newId } from '../../lib/ids'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  createdBy: string
  initial?: ProjectTemplate
}

export function CreateTemplateModal({ open, onOpenChange, workspaceId, createdBy, initial }: Props) {
  const add = useTemplatesStore((s) => s.add)
  const update = useTemplatesStore((s) => s.update)
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [sections, setSections] = useState(initial?.sectionNames.join(', ') ?? 'To do, In progress, Done')
  const [iconEmoji, setIconEmoji] = useState(initial?.iconEmoji ?? initial?.defaults.iconEmoji ?? '📋')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const sectionNames = sections.split(',').map((s) => s.trim()).filter(Boolean)
      if (initial) {
        await update(initial.id, { name: name.trim(), description, sectionNames, iconEmoji, defaults: { ...initial.defaults, iconEmoji } })
      } else {
        const template: ProjectTemplate = {
          id: newId(),
          name: name.trim(),
          description,
          iconEmoji,
          workspaceId,
          createdBy,
          defaults: { iconEmoji, color: 'primary', defaultView: 'list' },
          sectionNames,
          taskTemplates: [],
          customFieldIds: [],
        }
        await add(template)
      }
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">{initial ? 'Edit template' : 'Create template'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label>Icon</Label>
            <Input aria-label="Template icon" value={iconEmoji} onChange={(e) => setIconEmoji(e.target.value)} className="rounded-md border border-input bg-background text-foreground" maxLength={8} />
          </div>
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          </div>
          <div className="grid gap-1">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          </div>
          <div className="grid gap-1">
            <Label>Sections (comma-separated)</Label>
            <Input value={sections} onChange={(e) => setSections(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading || !name.trim()} onClick={() => void submit()}>
            {initial ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
