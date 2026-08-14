'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProjectMessage, updateProjectMessage } from '../../lib/projectMessages'
import type { Project, ProjectMessage } from '../../types'
import { tasklyticToast } from '../ui/tasklyticToast'
import { RichTextBlock } from '../status/RichTextBlock'

type Props = {
  project: Project
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPosted?: (messageId: string) => void
  editMessage?: ProjectMessage | null
}

/** Composer dialog for a new or edited project broadcast message. */
export function MessageComposer({
  project,
  currentUserId,
  open,
  onOpenChange,
  onPosted,
  editMessage,
}: Props) {
  const isEdit = Boolean(editMessage)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [announcement, setAnnouncement] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const reset = () => {
    setTitle('')
    setBody('')
    setAnnouncement(false)
    setEditorKey((key) => key + 1)
  }

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    if (editMessage) {
      setTitle(editMessage.title)
      setBody(editMessage.bodyHtml)
      setAnnouncement(editMessage.isAnnouncement)
      setEditorKey((key) => key + 1)
    } else {
      reset()
    }
  }, [open, editMessage])

  const hasBody = (html: string) => html.replace(/<[^>]+>/g, '').trim().length > 0

  const submit = async () => {
    if (!title.trim() || !hasBody(body) || submitting) return
    setSubmitting(true)
    try {
      if (isEdit && editMessage) {
        const updated = await updateProjectMessage({
          messageId: editMessage.id,
          authorId: currentUserId,
          title: title.trim(),
          bodyHtml: body,
          isAnnouncement: announcement,
        })
        if (!updated) {
          tasklyticToast('Could not save changes', { status: 'error' })
          return
        }
        tasklyticToast('Message updated', { status: 'success' })
        onOpenChange(false)
        onPosted?.(editMessage.id)
        return
      }

      const notifyCount = announcement ? project.memberIds.length : 0
      const message = await createProjectMessage({
        projectId: project.id,
        authorId: currentUserId,
        title: title.trim(),
        bodyHtml: body,
        isAnnouncement: announcement,
      })
      if (announcement) {
        tasklyticToast('Announcement posted', {
          status: 'success',
          description:
            notifyCount > 1
              ? `${notifyCount} project members notified in Inbox.`
              : 'Check your Inbox for the announcement.',
        })
      } else {
        tasklyticToast('Message posted', { status: 'success' })
      }
      reset()
      onOpenChange(false)
      onPosted?.(message.id)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans">{isEdit ? 'Edit message' : 'New message'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="msg-title">Title</Label>
            <Input id="msg-title" className="tl-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <RichTextBlock
              key={editorKey}
              html={body}
              onChange={setBody}
              placeholder="Write your message…"
              minHeight="min-h-32"
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="msg-announcement"
              checked={announcement}
              onCheckedChange={(checked) => setAnnouncement(checked === true)}
            />
            <Label htmlFor="msg-announcement" className="cursor-pointer text-sm font-normal leading-snug">
              Mark as announcement (notify all project members when posting new messages only)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="tl-btn-primary border-0"
            disabled={!title.trim() || !hasBody(body) || submitting}
            onClick={() => void submit()}
          >
            {isEdit ? 'Save changes' : 'Post message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
