'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { tasklyticApiJson } from '../../../lib/tasklyticApi'
import type { Invoice, Workspace } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice
  workspace: Workspace
  action: 'send' | 'resend'
  onSend: (payload: Record<string, unknown>) => Promise<void>
}

export function InvoiceSendDialog({ open, onOpenChange, invoice, workspace, action, onSend }: Props) {
  const settings = workspace.billingSettings
  const [recipient, setRecipient] = useState(invoice.documentSnapshot?.billTo.email ?? '')
  const [subject, setSubject] = useState(settings?.emailSubjectTemplate ?? 'Invoice {invoiceNumber} from {issuerName}')
  const [message, setMessage] = useState(settings?.emailMessageTemplate ?? 'Please find invoice {invoiceNumber} attached. Amount due: {amountDue}.')
  const [stripeAvailable, setStripeAvailable] = useState(false)
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false)
  const [includePaymentLink, setIncludePaymentLink] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setCapabilitiesLoaded(false)
    void tasklyticApiJson<{ capabilities: Array<{ provider: string; available: boolean }> }>(`/integrations/capabilities?workspace_id=${encodeURIComponent(workspace.id)}`)
      .then(({ capabilities }) => setStripeAvailable(Boolean(capabilities.find((item) => item.provider === 'stripe_connect')?.available)))
      .catch(() => setStripeAvailable(false))
      .finally(() => setCapabilitiesLoaded(true))
  }, [open, workspace.id])

  const submit = async () => {
    setPending(true); setError('')
    try {
      await onSend({ method: 'email', recipient, subject, message, includePaymentLink })
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invoice delivery failed.')
    } finally { setPending(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined} className="max-w-lg"><DialogHeader><DialogTitle>{action === 'resend' ? 'Email invoice again' : 'Email invoice'}</DialogTitle></DialogHeader><div className="grid gap-3"><p className="rounded-md border border-border bg-muted/30 p-3 text-sm">The frozen PDF for {invoice.invoiceNumber} will be attached. Issued invoice contents cannot be changed from this dialog.</p><div><Label htmlFor="invoice-recipient">Recipient</Label><Input id="invoice-recipient" maxLength={320} type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></div><div><Label htmlFor="invoice-email-subject">Subject</Label><Input id="invoice-email-subject" maxLength={998} value={subject} onChange={(event) => setSubject(event.target.value)} /></div><div><Label htmlFor="invoice-email-message">Message</Label><Textarea id="invoice-email-message" maxLength={10000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} /></div>{capabilitiesLoaded && stripeAvailable ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includePaymentLink} onChange={(event) => setIncludePaymentLink(event.target.checked)} />Include Stripe payment link</label> : <p className="text-sm text-muted-foreground">{capabilitiesLoaded ? 'Stripe Connect is not active, so this email will include only the attached PDF.' : 'Checking payment-link availability…'}</p>}{error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}</div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={pending || !recipient || !subject} onClick={() => void submit()}>{pending ? 'Queueing…' : 'Send invoice'}</Button></DialogFooter></DialogContent></Dialog>
}
