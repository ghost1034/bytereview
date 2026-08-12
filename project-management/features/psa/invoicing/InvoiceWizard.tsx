'use client'

/** Multi-step invoice generation from unbilled time + expenses. */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { buildInvoiceFromEntries } from '../../../lib/psa/invoiceActions'
import { createFxQuote, generateInvoice } from '../../../lib/billing/actions'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { useClientsStore, useExpensesStore, useInvoicesStore, useMattersStore, useProjectsStore, useTimeEntriesStore, useWorkspacesStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'

type Props = { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string }

export function InvoiceWizard({ open, onOpenChange, workspaceId }: Props) {
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const timeEntries = useTimeEntriesStore((s) => s.list())
  const expenses = useExpensesStore((s) => s.list())
  const matters = useMattersStore((s) => s.list().filter((matter) => matter.workspaceId === workspaceId))
  const projects = useProjectsStore((s) => s.list().filter((project) => project.workspaceId === workspaceId))
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const userId = useAuthStore((s) => s.currentUserId)

  const [step, setStep] = useState(1)
  const [clientId, setClientId] = useState('')
  const [billingScope, setBillingScope] = useState('all')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [taxAmount, setTaxAmount] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [discountReason, setDiscountReason] = useState('')
  const [notes, setNotes] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [writeOffIds, setWriteOffIds] = useState<Set<string>>(new Set())
  const [writeOffReason, setWriteOffReason] = useState('')
  const [narratives, setNarratives] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const client = clients.find((c) => c.id === clientId)
  const unbilledTime = useMemo(
    () => timeEntries.filter((e) => e.workspaceId === workspaceId && e.clientId === clientId && e.billable && (e.status === 'approved' || e.approved) && !e.invoiceId && (!periodStart || e.date >= periodStart) && (!periodEnd || e.date <= periodEnd) && (billingScope === 'all' || (billingScope.startsWith('matter:') ? e.matterId === billingScope.slice(7) : e.projectId === billingScope.slice(8)))),
    [timeEntries, workspaceId, clientId, billingScope, periodStart, periodEnd]
  )
  const unbilledExp = useMemo(
    () => expenses.filter((e) => e.workspaceId === workspaceId && e.clientId === clientId && e.billable && (e.status === 'approved' || e.approved) && !e.invoiceId && (!periodStart || e.date >= periodStart) && (!periodEnd || e.date <= periodEnd) && (billingScope === 'all' || (billingScope.startsWith('matter:') ? e.matterId === billingScope.slice(7) : e.projectId === billingScope.slice(8)))),
    [expenses, workspaceId, clientId, billingScope, periodStart, periodEnd]
  )
  useEffect(() => {
    setBillingScope('all'); setExcludedIds(new Set()); setWriteOffIds(new Set()); setNarratives({})
  }, [clientId])
  const invoiceTime = useMemo(() => unbilledTime.filter((entry) => !excludedIds.has(entry.id) && !writeOffIds.has(entry.id)), [unbilledTime, excludedIds, writeOffIds])
  const invoiceExpenses = useMemo(() => unbilledExp.filter((expense) => !excludedIds.has(expense.id) && !writeOffIds.has(expense.id)), [unbilledExp, excludedIds, writeOffIds])

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
      timeEntries: invoiceTime,
      expenses: invoiceExpenses,
      invoiceNumber: num,
      currency: client.defaultCurrency,
      taxAmount: parseFloat(taxAmount) || 0,
      discountAmount: parseFloat(discount) || 0,
    })
  }, [client, clientId, invoiceTime, invoiceExpenses, periodStart, periodEnd, taxAmount, discount, workspace, workspaceId])

  const generate = async () => {
    if (!preview || !userId) return
    setLoading(true)
    setError('')
    try {
      const invoiceCurrency = client?.defaultCurrency ?? workspace?.defaultCurrency ?? 'USD'
      const sourceCurrencies = new Set([
        ...unbilledTime.filter((entry) => !excludedIds.has(entry.id)).map((entry) => entry.currency ?? invoiceCurrency),
        ...unbilledExp.filter((expense) => !excludedIds.has(expense.id)).map((expense) => expense.currency ?? invoiceCurrency),
      ])
      const fxQuoteIds: string[] = []
      for (const sourceCurrency of sourceCurrencies) {
        if (sourceCurrency === invoiceCurrency) continue
        const quote = await createFxQuote(workspaceId, { baseCurrency: sourceCurrency, quoteCurrency: invoiceCurrency, rateDate: periodEnd || new Date().toISOString().slice(0, 10) })
        fxQuoteIds.push(quote.id)
      }
      await generateInvoice(workspaceId, {
        clientId,
        timeEntryIds: unbilledTime.filter((entry) => !excludedIds.has(entry.id)).map((entry) => entry.id),
        expenseIds: unbilledExp.filter((expense) => !excludedIds.has(expense.id)).map((expense) => expense.id),
        writeOffIds: [...writeOffIds], writeOffReason,
        narratives, currency: invoiceCurrency, fxQuoteIds,
        periodStart: periodStart || new Date().toISOString().slice(0, 10),
        periodEnd: periodEnd || new Date().toISOString().slice(0, 10),
        issueDate: new Date().toISOString().slice(0, 10), dueOn: dueOn || undefined,
        taxAmount: Number(taxAmount) || 0, discountAmount: Number(discount) || 0,
        discountReason, notes,
      })
      onOpenChange(false)
      setStep(1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invoice generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-serif text-xl">Generate invoice — step {step}/5</DialogTitle></DialogHeader>
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
          <div className="grid gap-3 py-2"><Label>Billing scope</Label><Select value={billingScope} onValueChange={setBillingScope}><SelectTrigger className="tl-input"><SelectValue /></SelectTrigger><SelectContent className="tl-popover-surface z-[100]"><SelectItem value="all">All open work for client</SelectItem>{matters.filter((matter) => matter.clientId === clientId).map((matter) => <SelectItem key={matter.id} value={`matter:${matter.id}`}>Matter {matter.matterNumber}</SelectItem>)}{projects.filter((project) => project.clientId === clientId && !matters.some((matter) => matter.projectId === project.id)).map((project) => <SelectItem key={project.id} value={`project:${project.id}`}>{project.name}</SelectItem>)}</SelectContent></Select></div>
        )}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label>Period start</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="tl-input" /></div>
            <div><Label>Period end</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="tl-input" /></div>
          </div>
        )}
        {step === 4 && preview && (
          <div className="max-h-64 space-y-2 overflow-y-auto py-2 text-sm">
            {[...unbilledTime, ...unbilledExp].map((entry) => <div key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b pb-2"><input aria-label={`Include ${entry.description}`} type="checkbox" checked={!excludedIds.has(entry.id)} onChange={() => setExcludedIds((old) => { const next = new Set(old); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next })} /><Input aria-label={`Narrative ${entry.description}`} value={narratives[entry.id] ?? entry.description} onChange={(event) => setNarratives((old) => ({ ...old, [entry.id]: event.target.value }))} /><label className="text-xs"><input type="checkbox" checked={writeOffIds.has(entry.id)} onChange={() => setWriteOffIds((old) => { const next = new Set(old); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next })} /> Write off</label></div>)}
            <div className="flex justify-between border-t pt-2 font-medium"><span>Total</span><span className="font-mono tabular-nums">{formatMoney(preview.total ?? preview.amount)}</span></div>
            {writeOffIds.size > 0 && <Input aria-label="Write-off reason" placeholder="Write-off reason" value={writeOffReason} onChange={(event) => setWriteOffReason(event.target.value)} />}
            <Input placeholder="Tax" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="tl-input font-mono tabular-nums" />
            <Input placeholder="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} className="tl-input font-mono tabular-nums" />
            <Input placeholder="Discount reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className="tl-input" />
          </div>
        )}
        {step === 5 && <div className="grid gap-3 py-2"><div><Label>Due date</Label><Input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} /></div><div><Label>Invoice notes</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div><p className="text-sm">Create a draft invoice. Submit and deliver it from the invoice detail page.</p></div>}
        {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        <DialogFooter>
          {step > 1 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < 5 ? (
            <Button className="tl-btn-primary border-0" disabled={step === 1 && !clientId} onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button className="tl-btn-primary border-0" disabled={loading || !preview || (writeOffIds.size > 0 && !writeOffReason) || (Number(discount) > 0 && !discountReason)} onClick={() => void generate()}>Create invoice</Button>
          )}
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
