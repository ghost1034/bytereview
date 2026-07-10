'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface DeclineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDecline: (reason: string) => void
  declining?: boolean
}

export function DeclineDialog({ open, onOpenChange, onDecline, declining }: DeclineDialogProps) {
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline to sign</DialogTitle>
          <DialogDescription>
            Declining ends this envelope for all parties. The sender will be notified with your
            reason, and it is recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for declining (required)"
          rows={4}
          maxLength={2000}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={declining}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onDecline(reason.trim())}
            disabled={!reason.trim() || declining}
          >
            {declining && <Loader2 className="mr-2 size-4 animate-spin" />}
            Decline envelope
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
