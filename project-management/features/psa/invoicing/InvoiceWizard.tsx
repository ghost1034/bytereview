'use client'

/** Multi-step invoice generation from unbilled time + expenses. */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogContent, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { buildInvoiceFromEntries } from '../../../lib/psa/invoiceActions'
import { createFxQuote, generateInvoice } from '../../../lib/billing/actions'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { formatTasklyticApiError, tasklyticApiErrorDiagnostics, TasklyticApiError } from '../../../lib/tasklyticApi'
import { useClientsStore, useExpensesStore, useInvoicesStore, useMattersStore, useProjectsStore, useTimeEntriesStore, useWorkspacesStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { invoicePeriodDefaults, isWithinInvoicePeriod, normalizeInvoicePeriod } from './invoicePeriod'
import { matchesBillingScope, matterForBillingScope } from './invoiceScope'
import { InvoiceDocumentPreview } from './InvoiceDocumentPreview'

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
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [linePresentation, setLinePresentation] = useState<'detailed' | 'summary'>(workspace?.billingSettings?.defaultLinePresentation ?? (workspace?.psaMode === 'legal' ? 'detailed' : 'summary'))
  const [billToName, setBillToName] = useState('')
  const [billToContact, setBillToContact] = useState('')
  const [billToEmail, setBillToEmail] = useState('')
  const [billToPhone, setBillToPhone] = useState('')
  const [billToAddress, setBillToAddress] = useState('')
  const [billToTaxId, setBillToTaxId] = useState('')
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [writeOffIds, setWriteOffIds] = useState<Set<string>>(new Set())
  const [writeOffReason, setWriteOffReason] = useState('')
  const [narratives, setNarratives] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorDiagnostics, setErrorDiagnostics] = useState<string[]>([])
  const [periodError, setPeriodError] = useState(false)

  const client = clients.find((c) => c.id === clientId)
  const selectedMatter = matterForBillingScope(billingScope, matters)
  const eligibleTime = useMemo(
    () => timeEntries.filter((e) => e.workspaceId === workspaceId && e.clientId === clientId && e.billable && (e.status === 'approved' || e.approved) && !e.invoiceId),
    [timeEntries, workspaceId, clientId]
  )
  const eligibleExpenses = useMemo(
    () => expenses.filter((e) => e.workspaceId === workspaceId && e.clientId === clientId && e.billable && (e.status === 'approved' || e.approved) && !e.invoiceId),
    [expenses, workspaceId, clientId]
  )
  const scopedUnbilledTime = useMemo(
    () => eligibleTime.filter((entry) => matchesBillingScope(entry, billingScope, matters)),
    [eligibleTime, billingScope, matters]
  )
  const scopedUnbilledExp = useMemo(
    () => eligibleExpenses.filter((expense) => matchesBillingScope(expense, billingScope, matters)),
    [eligibleExpenses, billingScope, matters]
  )
  const periodValidation = useMemo(
    () => normalizeInvoicePeriod(periodStart, periodEnd, [...scopedUnbilledTime, ...scopedUnbilledExp]),
    [periodStart, periodEnd, scopedUnbilledTime, scopedUnbilledExp]
  )
  const invoicePeriod = periodValidation.period
  const unbilledTime = useMemo(
    () => invoicePeriod ? scopedUnbilledTime.filter((entry) => isWithinInvoicePeriod(entry.date, invoicePeriod)) : [],
    [invoicePeriod, scopedUnbilledTime]
  )
  const unbilledExp = useMemo(
    () => invoicePeriod ? scopedUnbilledExp.filter((expense) => isWithinInvoicePeriod(expense.date, invoicePeriod)) : [],
    [invoicePeriod, scopedUnbilledExp]
  )
  const scopeExcludedCount = selectedMatter && invoicePeriod
    ? eligibleTime.filter((entry) => isWithinInvoicePeriod(entry.date, invoicePeriod)).length
      + eligibleExpenses.filter((expense) => isWithinInvoicePeriod(expense.date, invoicePeriod)).length
      - unbilledTime.length - unbilledExp.length
    : 0
  useEffect(() => {
    setBillingScope('all'); setPeriodStart(''); setPeriodEnd(''); setExcludedIds(new Set()); setWriteOffIds(new Set()); setNarratives({})
    setBillToName(client?.name ?? ''); setBillToContact(client?.contactName ?? ''); setBillToEmail(client?.contactEmail ?? ''); setBillToPhone(client?.contactPhone ?? ''); setBillToAddress(client?.billingAddress ?? ''); setBillToTaxId(client?.taxId ?? '')
  }, [clientId, client])
  const invoiceTime = useMemo(() => unbilledTime.filter((entry) => !excludedIds.has(entry.id) && !writeOffIds.has(entry.id)), [unbilledTime, excludedIds, writeOffIds])
  const invoiceExpenses = useMemo(() => unbilledExp.filter((expense) => !excludedIds.has(expense.id) && !writeOffIds.has(expense.id)), [unbilledExp, excludedIds, writeOffIds])

  const preview = useMemo(() => {
    if (!client || !invoicePeriod) return null
    const existing = useInvoicesStore.getState().list().filter((i) => i.workspaceId === workspaceId)
    const num = `${workspace?.invoicePrefix ?? 'INV-'}${String((workspace?.invoiceStartNumber ?? 1000) + existing.length)}`
    return buildInvoiceFromEntries({
      workspaceId,
      clientId,
      clientName: client.name,
      periodStart: invoicePeriod.start,
      periodEnd: invoicePeriod.end,
      timeEntries: invoiceTime,
      expenses: invoiceExpenses,
      invoiceNumber: num,
      currency: client.defaultCurrency,
      taxAmount: parseFloat(taxAmount) || 0,
      discountAmount: parseFloat(discount) || 0,
    })
  }, [client, clientId, invoiceTime, invoiceExpenses, invoicePeriod, taxAmount, discount, workspace, workspaceId])
  const previewLines = useMemo(() => {
    const detailed = [
      ...invoiceTime.map((entry) => ({ id: entry.id, serviceDate: entry.date, description: narratives[entry.id] ?? entry.description, professionalCategory: 'Professional services', matterProjectLabel: projects.find((project) => project.id === entry.projectId)?.name ?? 'General', quantity: entry.hours, rate: entry.rateSnapshot ?? ((entry.amount ?? 0) / (entry.hours || 1)), amount: entry.amount ?? (entry.hours * (entry.rateSnapshot ?? 0)) })),
      ...invoiceExpenses.map((entry) => ({ id: entry.id, serviceDate: entry.date, description: narratives[entry.id] ?? entry.description, professionalCategory: entry.category.replace(/_/g, ' '), matterProjectLabel: projects.find((project) => project.id === entry.projectId)?.name ?? 'General', quantity: 1, rate: entry.billableAmount ?? entry.totalAmount ?? entry.amount, amount: entry.billableAmount ?? entry.totalAmount ?? entry.amount })),
    ]
    if (linePresentation === 'detailed') return detailed
    const grouped = new Map<string, typeof detailed[number]>()
    detailed.forEach((line) => { const key = `${line.matterProjectLabel}:${line.professionalCategory === 'Professional services' ? 'services' : 'expenses'}`; const current = grouped.get(key); grouped.set(key, current ? { ...current, amount: current.amount + line.amount, description: current.professionalCategory === 'Professional services' ? 'Professional services' : 'Reimbursable expenses' } : { ...line, id: key, description: line.professionalCategory === 'Professional services' ? 'Professional services' : 'Reimbursable expenses' }) })
    return [...grouped.values()]
  }, [invoiceExpenses, invoiceTime, linePresentation, narratives, projects])

  const generate = async () => {
    if (!preview || !userId || !invoicePeriod) return
    const submittedPeriodStart = invoicePeriod.start
    const submittedPeriodEnd = invoicePeriod.end
    setLoading(true)
    setError('')
    setErrorDiagnostics([])
    setPeriodError(false)
    try {
      const invoiceCurrency = client?.defaultCurrency ?? workspace?.defaultCurrency ?? 'USD'
      const sourceCurrencies = new Set([
        ...unbilledTime.filter((entry) => !excludedIds.has(entry.id)).map((entry) => entry.currency ?? invoiceCurrency),
        ...unbilledExp.filter((expense) => !excludedIds.has(expense.id)).map((expense) => expense.currency ?? invoiceCurrency),
      ])
      const fxQuoteIds: string[] = []
      for (const sourceCurrency of sourceCurrencies) {
        if (sourceCurrency === invoiceCurrency) continue
        const quote = await createFxQuote(workspaceId, { baseCurrency: sourceCurrency, quoteCurrency: invoiceCurrency, rateDate: submittedPeriodEnd })
        fxQuoteIds.push(quote.id)
      }
      await generateInvoice(workspaceId, {
        clientId,
        matterId: selectedMatter?.id,
        timeEntryIds: unbilledTime.filter((entry) => !excludedIds.has(entry.id)).map((entry) => entry.id),
        expenseIds: unbilledExp.filter((expense) => !excludedIds.has(expense.id)).map((expense) => expense.id),
        writeOffIds: [...writeOffIds], writeOffReason,
        narratives, currency: invoiceCurrency, fxQuoteIds,
        periodStart: submittedPeriodStart,
        periodEnd: submittedPeriodEnd,
        issueDate, dueOn: dueOn || undefined,
        taxAmount: Number(taxAmount) || 0, discountAmount: Number(discount) || 0,
        discountReason, notes, linePresentation,
        pageSize: workspace?.billingSettings?.pageSize ?? 'letter',
        taxLabel: workspace?.billingSettings?.taxLabel ?? 'Tax',
        billTo: { name: billToName, contactName: billToContact, email: billToEmail, phone: billToPhone, address: billToAddress, taxId: billToTaxId },
      })
      onOpenChange(false)
      setStep(1)
    } catch (caught) {
      const sourceId = caught instanceof TasklyticApiError ? caught.sourceId : undefined
      const timeEntry = sourceId ? timeEntries.find((entry) => entry.id === sourceId) : undefined
      const expense = sourceId ? expenses.find((entry) => entry.id === sourceId) : undefined
      const source = timeEntry ?? expense
      setError(formatTasklyticApiError(caught, source ? {
        sourceLabel: `${timeEntry ? 'Time entry' : 'Expense'} “${source.description}”`,
        sourceDate: source.date,
        periodStart: submittedPeriodStart,
        periodEnd: submittedPeriodEnd,
      } : {}))
      setErrorDiagnostics(tasklyticApiErrorDiagnostics(caught))
      if (caught instanceof TasklyticApiError && caught.code === 'source_outside_invoice_period') {
        setPeriodError(true)
        setStep(3)
      }
    } finally {
      setLoading(false)
    }
  }

  const advance = () => {
    if (step === 2 && (!periodStart || !periodEnd)) {
      const defaults = invoicePeriodDefaults([...scopedUnbilledTime, ...scopedUnbilledExp])
      setPeriodStart(defaults.start)
      setPeriodEnd(defaults.end)
    }
    setStep((current) => current + 1)
  }

  const selectBillingScope = (value: string) => {
    setBillingScope(value)
    setPeriodStart('')
    setPeriodEnd('')
    setExcludedIds(new Set())
    setWriteOffIds(new Set())
    setNarratives({})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-sans text-xl">Generate invoice — step {step}/5</DialogTitle></DialogHeader>
        {step === 1 && (
          <div className="grid gap-3 py-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent className="z-[100]">{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-3 py-2"><Label>Billing scope</Label><Select value={billingScope} onValueChange={selectBillingScope}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger><SelectContent className="z-[100]"><SelectItem value="all">All open work for client</SelectItem>{matters.filter((matter) => matter.clientId === clientId).map((matter) => <SelectItem key={matter.id} value={`matter:${matter.id}`}>Matter {matter.matterNumber} — {projects.find((project) => project.id === matter.projectId)?.name ?? 'Linked project unavailable'}</SelectItem>)}{projects.filter((project) => project.clientId === clientId && !matters.some((matter) => matter.projectId === project.id)).map((project) => <SelectItem key={project.id} value={`project:${project.id}`}>{project.name}</SelectItem>)}</SelectContent></Select></div>
        )}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label htmlFor="invoice-period-start">Period start</Label><Input id="invoice-period-start" type="date" value={periodStart} aria-invalid={periodError || Boolean(periodValidation.error)} aria-describedby={periodError ? 'invoice-generation-error' : periodValidation.error ? 'invoice-period-error' : undefined} onChange={(e) => { setPeriodStart(e.target.value); setPeriodError(false) }} className={periodError ? 'border-destructive focus-visible:ring-destructive' : ''} /></div>
            <div><Label htmlFor="invoice-period-end">Period end</Label><Input id="invoice-period-end" type="date" value={periodEnd} aria-invalid={periodError || Boolean(periodValidation.error)} aria-describedby={periodError ? 'invoice-generation-error' : periodValidation.error ? 'invoice-period-error' : undefined} onChange={(e) => { setPeriodEnd(e.target.value); setPeriodError(false) }} className={periodError ? 'border-destructive focus-visible:ring-destructive' : ''} /></div>
            {periodValidation.error && <p id="invoice-period-error" role="alert" className="col-span-2 text-sm text-destructive">{periodValidation.error}</p>}
          </div>
        )}
        {step === 4 && preview && (
          <div className="max-h-64 space-y-2 overflow-y-auto py-2 text-sm">
            {scopeExcludedCount > 0 && <p className="text-muted-foreground">{scopeExcludedCount} approved billing {scopeExcludedCount === 1 ? 'source is' : 'sources are'} excluded because {scopeExcludedCount === 1 ? 'it is' : 'they are'} not linked to this matter or its project.</p>}
            {[...unbilledTime, ...unbilledExp].map((entry) => <div key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b pb-2"><input aria-label={`Include ${entry.description}`} type="checkbox" checked={!excludedIds.has(entry.id)} onChange={() => setExcludedIds((old) => { const next = new Set(old); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next })} /><Input aria-label={`Narrative ${entry.description}`} value={narratives[entry.id] ?? entry.description} onChange={(event) => setNarratives((old) => ({ ...old, [entry.id]: event.target.value }))} /><label className="text-xs"><input type="checkbox" checked={writeOffIds.has(entry.id)} onChange={() => setWriteOffIds((old) => { const next = new Set(old); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next })} /> Write off</label></div>)}
            <div className="flex justify-between border-t pt-2 font-medium"><span>Total</span><span className="font-mono tabular-nums">{formatMoney(preview.total ?? preview.amount)}</span></div>
            {writeOffIds.size > 0 && <Input aria-label="Write-off reason" placeholder="Write-off reason" value={writeOffReason} onChange={(event) => setWriteOffReason(event.target.value)} />}
            <Input aria-label="Tax amount" placeholder="Tax" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" />
            <Input placeholder="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" />
            <Input placeholder="Discount reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          </div>
        )}
        {step === 5 && preview && <div className="grid gap-5 py-2 lg:grid-cols-[20rem_1fr]"><div className="grid content-start gap-3"><div className="grid grid-cols-2 gap-2"><div><Label>Issue date</Label><Input aria-label="Issue date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></div><div><Label>Due date</Label><Input aria-label="Due date" type="date" value={dueOn} min={issueDate} onChange={(event) => setDueOn(event.target.value)} /></div></div><div><Label>Line presentation</Label><select aria-label="Line presentation" className="h-10 w-full rounded-md border border-input bg-background px-3" value={linePresentation} onChange={(event) => setLinePresentation(event.target.value as typeof linePresentation)}><option value="detailed">Detailed</option><option value="summary">Summarized</option></select></div><Input aria-label="Bill-to name" placeholder="Bill-to name" maxLength={300} value={billToName} onChange={(event) => setBillToName(event.target.value)} /><Input aria-label="Bill-to contact" placeholder="Contact name" maxLength={200} value={billToContact} onChange={(event) => setBillToContact(event.target.value)} /><Input aria-label="Bill-to email" placeholder="Email" maxLength={320} type="email" value={billToEmail} onChange={(event) => setBillToEmail(event.target.value)} /><Input aria-label="Bill-to phone" placeholder="Phone" maxLength={100} value={billToPhone} onChange={(event) => setBillToPhone(event.target.value)} /><Textarea aria-label="Bill-to address" placeholder="Billing address" maxLength={1000} value={billToAddress} onChange={(event) => setBillToAddress(event.target.value)} /><Input aria-label="Bill-to tax ID" placeholder="Tax ID" maxLength={200} value={billToTaxId} onChange={(event) => setBillToTaxId(event.target.value)} /><div><Label>Invoice notes</Label><Textarea maxLength={10000} value={notes} onChange={(event) => setNotes(event.target.value)} /></div><p className="text-sm">This creates an editable draft. Submission freezes the client-ready document.</p></div><InvoiceDocumentPreview issuerName={workspace?.billingSettings?.issuerDisplayName ?? workspace?.billingSettings?.brandedHeader ?? workspace?.name ?? 'Invoice'} issuerDetails={[workspace?.billingSettings?.issuerAddress, workspace?.billingSettings?.issuerEmail, workspace?.billingSettings?.issuerPhone].filter(Boolean).join('\n')} billToName={billToName} billToDetails={[billToContact, billToAddress, billToEmail, billToPhone, billToTaxId ? `Tax ID: ${billToTaxId}` : ''].filter(Boolean).join('\n')} invoiceNumber={preview.invoiceNumber} issueDate={issueDate} dueOn={dueOn} periodStart={invoicePeriod?.start} periodEnd={invoicePeriod?.end} currency={preview.currency} accentColor={workspace?.billingSettings?.accentColor} linePresentation={linePresentation} lines={previewLines} subtotal={(preview.subtotalFees ?? 0) + (preview.subtotalExpenses ?? 0)} discount={Number(discount) || 0} tax={Number(taxAmount) || 0} taxLabel={workspace?.billingSettings?.taxLabel} total={preview.total ?? preview.amount} notes={notes} paymentInstructions={workspace?.billingSettings?.paymentInstructions} footer={workspace?.billingSettings?.defaultFooter} /></div>}
        {error && <div id="invoice-generation-error" role="alert" className="space-y-1 text-sm text-destructive"><p>{error}</p>{errorDiagnostics.length > 0 && <p className="font-mono text-xs">{errorDiagnostics.join(' · ')}</p>}</div>}
        <DialogFooter>
          {step > 1 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < 5 ? (
            <Button className=" border-0" disabled={(step === 1 && !clientId) || (step === 3 && !invoicePeriod)} onClick={advance}>Next</Button>
          ) : (
            <Button className=" border-0" disabled={loading || !preview || Boolean(dueOn && dueOn < issueDate) || (writeOffIds.size > 0 && !writeOffReason) || (Number(discount) > 0 && !discountReason)} onClick={() => void generate()}>Create invoice</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
