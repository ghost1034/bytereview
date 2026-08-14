'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { useTasksStore } from '../../stores/entities'
import type { Project } from '../../types'

type Props = {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateMilestoneDialog({ project, open, onOpenChange }: Props) {
  const addTask = useTasksStore((s) => s.add)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setDueOn('')
    setSubmitting(false)
  }, [open])

  const submit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || submitting) return

    const sectionId = project.sectionIds[0]
    if (!sectionId) return

    setSubmitting(true)
    try {
      const trimmedDescription = description.trim()
      await addTask({
        id: newId(),
        workspaceId: project.workspaceId,
        name: trimmedName,
        notes: trimmedDescription || undefined,
        resourceSubtype: 'milestone',
        completed: false,
        collaboratorIds: [],
        projectIds: [project.id],
        sectionIdByProject: { [project.id]: sectionId },
        tagIds: [],
        customFieldValues: {},
        dependencyIds: [],
        dependentIds: [],
        attachmentIds: [],
        likedByIds: [],
        dueOn: dueOn || undefined,
        createdAt: now(),
        modifiedAt: now(),
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans">Add milestone</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="milestone-name">Name</Label>
            <Input
              id="milestone-name"
              className="rounded-md border border-input bg-background text-foreground"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Beta launch"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-description">Description</Label>
            <Textarea
              id="milestone-description"
              className="rounded-md border border-input bg-background text-foreground min-h-24"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this milestone represent? (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-due">Due date</Label>
            <Input
              id="milestone-due"
              type="date"
              className="rounded-md border border-input bg-background text-foreground w-auto"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
            <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              Optional — leave blank if no target date yet.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className=" border-0"
            disabled={!name.trim() || submitting}
            onClick={() => void submit()}
          >
            Add milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
