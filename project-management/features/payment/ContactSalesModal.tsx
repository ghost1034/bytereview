'use client'

/** Contact-sales modal — V1 payment adapter billing inquiry. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getPaymentAdapter } from '../../lib/payment'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  userId: string
  type: 'upgrade' | 'manage_payment'
  title: string
}

export function ContactSalesModal({
  open,
  onOpenChange,
  workspaceId,
  userId,
  type,
  title,
}: Props) {
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      await getPaymentAdapter().createBillingInquiry({
        workspaceId,
        userId,
        type,
        message: message.trim() || undefined,
      })
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setMessage('')
      setSubmitted(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="tl-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
        </DialogHeader>
        {submitted ? (
          <p className="py-4 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            Thanks — our team will reach out shortly. Your request appears under Settings → Billing inquiries.
          </p>
        ) : (
          <div className="grid gap-2 py-2">
            <Label htmlFor="billing-note">Message (optional)</Label>
            <Textarea
              id="billing-note"
              rows={4}
              placeholder="Tell us about your team size or billing needs…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )}
        <DialogFooter>
          {submitted ? (
            <Button className="tl-btn-primary" onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button className="tl-btn-primary" disabled={loading} onClick={() => void submit()}>
                {loading ? 'Submitting…' : 'Contact sales'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
