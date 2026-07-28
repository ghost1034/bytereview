'use client'

/** Modal to save an existing project as a workspace template. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TasklyticDialogContent } from '../shell/TasklyticDialogContent'
import { saveProjectAsTemplate } from '../../lib/templates/saveTemplate'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
  createdBy: string
  defaultName?: string
}

export function SaveProjectAsTemplateModal({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  createdBy,
  defaultName = '',
}: Props) {
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [iconEmoji, setIconEmoji] = useState('📋')
  const [includeTasks, setIncludeTasks] = useState(true)
  const [includeRules, setIncludeRules] = useState(true)
  const [includeCustomFields, setIncludeCustomFields] = useState(true)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await saveProjectAsTemplate({
        projectId,
        workspaceId,
        createdBy,
        name: name.trim(),
        description: description.trim() || undefined,
        iconEmoji,
        includeTasks,
        includeRules,
        includeCustomFields,
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Save as template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} className="tl-input" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tpl-desc">Description</Label>
            <Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="tl-input" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeTasks} onChange={(e) => setIncludeTasks(e.target.checked)} />
            Include tasks
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeRules} onChange={(e) => setIncludeRules(e.target.checked)} />
            Include rules
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeCustomFields} onChange={(e) => setIncludeCustomFields(e.target.checked)} />
            Include custom fields
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading || !name.trim()} onClick={() => void submit()}>
            Save template
          </Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
