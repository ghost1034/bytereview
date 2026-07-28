'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '../../stores/auth'
import { useFeedbackStore } from '../../stores/feedback'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { TasklyticDialogContent } from './TasklyticDialogContent'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: Props) {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const { workspaceId } = useWorkspaceContext()
  const addFeedback = useFeedbackStore((s) => s.add)

  const submit = () => {
    const trimmed = message.trim()
    if (!trimmed || !currentUserId) return
    addFeedback({ userId: currentUserId, workspaceId: workspaceId ?? undefined, message: trimmed })
    setSent(true)
    setMessage('')
    setTimeout(() => {
      setSent(false)
      onOpenChange(false)
    }, 1200)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Send feedback</DialogTitle>
        </DialogHeader>
        {sent ? (
          <p className="text-sm" style={{ color: 'var(--accent)' }}>Thanks — your feedback was saved.</p>
        ) : (
          <Textarea
            className="tl-input min-h-[120px]"
            placeholder="Tell us what you think…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary" disabled={!message.trim() || sent} onClick={submit}>
            Send
          </Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
