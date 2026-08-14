'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TasklyticDialogContent } from './TasklyticDialogContent'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InvitePeopleDialog({ open, onOpenChange }: Props) {
  const [inviteEmails, setInviteEmails] = useState('')

  const close = () => {
    setInviteEmails('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">Invite people</DialogTitle>
        </DialogHeader>
        <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          Enter email addresses separated by commas. Full invite delivery ships in a later step.
        </p>
        <Input
          className="tl-input"
          placeholder="colleague@company.com"
          value={inviteEmails}
          onChange={(e) => setInviteEmails(e.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button className="tl-btn-primary" onClick={close}>Send invites</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
