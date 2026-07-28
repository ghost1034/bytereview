'use client'

/** Multi-step invoice generation from unbilled time + expenses. */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { buildInvoiceFromEntries } from '../../../lib/psa/invoiceActions'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { entryHours } from '../../../lib/psa/timeEntryUtils'
import { useClientsStore, useExpensesStore, useInvoicesStore, useTimeEntriesStore, useWorkspacesStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'

type Props = { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string }

export function InvoiceWizard({ open, onOpenChange, workspaceId }: Props) {
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const timeEntries = useTimeEntriesStore((s) => s.list())
  const expenses = useExpensesStore((s) => s.list())
  const addInvoice = useInvoicesStore((s) => s.add)
  const updateTime = useTimeEntriesStore((s) => s.update)
  const updateExpense = useExpensesStore((s) => s.update)
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const userId = useAuthStore((s) => s.currentUserId)

  const [step, setStep] = useState(1)
  const [clientId, setClientId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [taxAmount, setTaxAmount] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [trustApplied, setTrustApplied] = useState('0')
  const [loading, setLoading] = useState(false)

  const client = clients.find((c) => c.id === clientId)
  const unbilledTime = useMemo(
    () => timeEntries.filter((e) => e.workspaceId === workspaceId && e.clientId === clientId && e.billable && (e.status === 'approved' || e.approved) && !e.invoiceId),
    [timeEntries, workspaceId, clientId]
  )
  const unbilledExp = useMemo(
    () => expenses.filter((e) => e.workspaceId === workspaceId && e.clientId === clientId && e.billable && (e.status === 'approved' || e.approved) && !e.invoiceId),
    [expenses, workspaceId, clientId]
  )

  const preview = useMemo(() => {
    if (!client) return null
    const existing = useInvoicesStore.getState().list().filter((i) => i.workspaceId === workspaceId)
    const num = `${workspace?.invoicePrefix ?? 'INV-'}${String((workspace?.invoiceStartNumber ?? 1000) + existing.length)}`
    return buildInvoiceFromEntries({
      workspaceId,
      clientId,
      clientName: client.name,
      periodStart: periodStart || new Date().toISOString().slice(0, 10),
      periodEnd: periodEnd || new Date().toISOString().slice(0, 10),
      timeEntries: unbilledTime,
      expenses: unbilledExp,
      invoiceNumber: num,
      currency: client.defaultCurrency,
      taxAmount: parseFloat(taxAmount) || 0,
      discountAmount: parseFloat(discount) || 0,
      trustApplied: parseFloat(trustApplied) || 0,
    })
  }, [client, clientId, unbilledTime, unbilledExp, periodStart, periodEnd, taxAmount, discount, trustApplied, workspace, workspaceId])

  const generate = async () => {
    if (!preview || !userId) return
    setLoading(true)
    try {
      await addInvoice(preview)
      await Promise.all(unbilledTime.map((e) => updateTime(e.id, { status: 'billed', invoiced: true, invoiceId: preview.id })))
      await Promise.all(unbilledExp.map((e) => updateExpense(e.id, { status: 'billed', invoiced: true, invoiceId: preview.id })))
      onOpenChange(false)
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-serif text-xl">Generate invoice — step {step}/4</DialogTitle></DialogHeader>
        {step === 1 && (
          <div className="grid gap-3 py-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="tl-input"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label>Period start</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="tl-input" /></div>
            <div><Label>Period end</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="tl-input" /></div>
          </div>
        )}
        {step === 3 && preview && (
          <div className="max-h-64 space-y-2 overflow-y-auto py-2 text-sm">
            {unbilledTime.map((e) => <div key={e.id} className="flex justify-between"><span>{e.description}</span><span className="font-mono tabular-nums">{entryHours(e).toFixed(2)}h · {formatMoney(e.amount ?? 0)}</span></div>)}
            {unbilledExp.map((e) => <div key={e.id} className="flex justify-between"><span>{e.description}</span><span className="font-mono tabular-nums">{formatMoney(e.billableAmount ?? e.amount)}</span></div>)}
            <div className="flex justify-between border-t pt-2 font-medium"><span>Total</span><span className="font-mono tabular-nums">{formatMoney(preview.total ?? preview.amount)}</span></div>
          </div>
        )}
        {step === 4 && (
          <div className="grid gap-3 py-2">
            <Input placeholder="Tax" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="tl-input font-mono tabular-nums" />
            <Input placeholder="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} className="tl-input font-mono tabular-nums" />
            <Input placeholder="Trust applied" value={trustApplied} onChange={(e) => setTrustApplied(e.target.value)} className="tl-input font-mono tabular-nums" />
            {preview && <p className="text-right font-mono tabular-nums">{formatMoney(preview.total ?? preview.amount)}</p>}
          </div>
        )}
        <DialogFooter>
          {step > 1 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < 4 ? (
            <Button className="tl-btn-primary border-0" disabled={step === 1 && !clientId} onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button className="tl-btn-primary border-0" disabled={loading || !preview} onClick={() => void generate()}>Create invoice</Button>
          )}
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
