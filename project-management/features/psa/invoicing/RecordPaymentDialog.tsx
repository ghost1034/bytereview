'use client'

/** Record payment against an invoice (PaymentAdapter stub — manual record). */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { buildPayment, invoiceAfterPayment } from '../../../lib/psa/invoiceActions'
import { useClientsStore, useInvoicesStore, usePaymentsStore } from '../../../stores/entities'
import type { Invoice, Payment } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: Invoice
  recordedById: string
}

export function RecordPaymentDialog({ open, onOpenChange, invoice, recordedById }: Props) {
  const addPayment = usePaymentsStore((s) => s.add)
  const updateInvoice = useInvoicesStore((s) => s.update)
  const updateClient = useClientsStore((s) => s.update)
  const [amount, setAmount] = useState(String(invoice.amountOutstanding ?? invoice.amount))
  const [method, setMethod] = useState<Payment['method']>('check')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setLoading(true)
    try {
      const payment = buildPayment(invoice.workspaceId, invoice.id, amt, invoice.currency ?? 'USD', method, recordedById, reference)
      await addPayment(payment)
      await updateInvoice(invoice.id, invoiceAfterPayment(invoice, amt))
      if (method === 'trust_application' && invoice.clientId) {
        const client = useClientsStore.getState().getById(invoice.clientId)
        if (client) await updateClient(client.id, { retainerBalance: Math.max(0, (client.retainerBalance ?? 0) - amt) })
      }
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-serif text-xl">Record payment</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Amount</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} className="tl-input font-mono tabular-nums" /></div>
          <div><Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as Payment['method'])}>
              <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                {(['check', 'ach', 'wire', 'card', 'trust_application', 'other'] as const).map((m) => (
                  <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="tl-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={() => void submit()}>Record</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
