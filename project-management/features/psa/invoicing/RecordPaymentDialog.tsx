'use client'

/** Record payment against an invoice (PaymentAdapter stub — manual record). */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogContent, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { applyInvoicePayment } from '../../../lib/billing/actions'
import type { Invoice, Payment } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: Invoice
}

export function RecordPaymentDialog({ open, onOpenChange, invoice }: Props) {
  const [amount, setAmount] = useState(String(invoice.amountOutstanding ?? invoice.amount))
  const [method, setMethod] = useState<Payment['method']>('check')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setLoading(true)
    try {
      await applyInvoicePayment(invoice.id, invoice.workspaceId, {
        amount: amt, currency: invoice.currency ?? 'USD', method, reference,
        paidAt: new Date().toISOString().slice(0, 10),
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-sans text-xl">Record payment</DialogTitle><DialogDescription>Apply a manual payment to {invoice.invoiceNumber}. Reversals remain in the audit history.</DialogDescription></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Amount</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" /></div>
          <div><Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as Payment['method'])}>
              <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                {(['check', 'ach', 'wire', 'card', 'trust_application', 'other'] as const).map((m) => (
                  <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading} onClick={() => void submit()}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
