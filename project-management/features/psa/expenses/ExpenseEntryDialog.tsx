'use client'

/** Expense entry dialog with private upload, Vertex extraction, and manual fallback. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DialogContent, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useExpensesStore, useAttachmentsStore } from '../../../stores/entities'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { getFileStorageAdapter } from '../../../lib/fileStorage'
import { getOcrAdapter } from '../../../lib/ocr'
import { runPsaAction } from '../../../lib/psa/actions'
import { EXPENSE_CATEGORY_LABELS, DEFAULT_MILEAGE_RATE } from '../../../lib/psa/constants'
import { computeBillableAmount, defaultPassThrough, expenseTotals, mileageAmount } from '../../../lib/psa/expenseUtils'
import { formatMoney } from '../../../lib/billing/formatMoney'
import type { Expense, ExpenseCategory, Task } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  userId: string
  task?: Task
  projectId?: string
  matterId?: string
  clientId?: string
  mileageMode?: boolean
  mileageRate?: number
  expense?: Expense
}

export function ExpenseEntryDialog(props: Props) {
  const add = useExpensesStore((s) => s.add)
  const addAttachment = useAttachmentsStore((s) => s.add)
  const [description, setDescription] = useState(props.expense?.description ?? '')
  const [vendor, setVendor] = useState(props.expense?.vendor ?? props.expense?.manualReceipt?.vendor ?? '')
  const [category, setCategory] = useState<ExpenseCategory>((props.expense?.category as ExpenseCategory) ?? (props.mileageMode ? 'mileage' : 'other'))
  const [amount, setAmount] = useState(String(props.expense?.amount ?? ''))
  const [taxAmount, setTaxAmount] = useState(String(props.expense?.taxAmount ?? 0))
  const [date, setDate] = useState(props.expense?.date ?? new Date().toISOString().slice(0, 10))
  const [billable, setBillable] = useState(props.expense?.billable ?? true)
  const [passThrough, setPassThrough] = useState(props.expense?.passThrough ?? defaultPassThrough(category))
  const [markup, setMarkup] = useState(String(props.expense?.markupPercent ?? 0))
  const [reimbursable, setReimbursable] = useState(props.expense?.reimbursable ?? false)
  const [miles, setMiles] = useState(String(props.expense?.mileageMiles ?? ''))
  const [ocrHint, setOcrHint] = useState('')
  const [receiptAttachmentId, setReceiptAttachmentId] = useState(props.expense?.receiptAttachmentId)
  const [receiptUrl, setReceiptUrl] = useState(props.expense?.receiptUrl)
  const [loading, setLoading] = useState(false)

  const rate = props.mileageRate ?? DEFAULT_MILEAGE_RATE
  const baseAmount = props.mileageMode ? mileageAmount(parseFloat(miles) || 0, rate) : parseFloat(amount) || 0
  const tax = parseFloat(taxAmount) || 0
  const { totalAmount } = expenseTotals(baseAmount, tax)
  const billableAmount = computeBillableAmount(totalAmount, billable, passThrough, parseFloat(markup) || 0)

  const onReceipt = async (file: File) => {
    const storage = getFileStorageAdapter()
    const uploaded = await storage.upload({ file, ownerId: props.userId, scope: 'receipt', scopeId: props.workspaceId, workspaceId: props.workspaceId })
    const ocr = getOcrAdapter()
    const result = await ocr.scanReceipt({ file, objectName: uploaded.ref, workspaceId: props.workspaceId })
    if (result.status === 'manual_required') setOcrHint('Automatic extraction is unavailable — verify and enter receipt values manually.')
    else setOcrHint('Receipt values extracted. Verify them before saving.')
    if (result.vendor) setVendor(result.vendor)
    if (result.date) setDate(result.date)
    if (result.amount != null) setAmount(String(result.amount))
    if (result.taxAmount != null) setTaxAmount(String(result.taxAmount))
    const attachmentId = newId()
    await addAttachment({ id: attachmentId, name: file.name, size: file.size, mime: file.type, dataUrl: uploaded.dataUrl, storage: uploaded.storage, storageRef: uploaded.ref, uploadedBy: props.userId, taskId: props.task?.id, createdAt: now() })
    setReceiptAttachmentId(attachmentId)
    setReceiptUrl(uploaded.dataUrl ?? uploaded.ref)
  }

  const submit = async () => {
    if (!description.trim() || totalAmount <= 0) return
    setLoading(true)
    try {
      const expense: Expense = {
        id: newId(),
        workspaceId: props.workspaceId,
        userId: props.userId,
        taskId: props.task?.id,
        projectId: props.projectId ?? props.task?.projectIds[0],
        matterId: props.matterId,
        clientId: props.clientId,
        description: description.trim(),
        vendor: vendor || undefined,
        amount: baseAmount,
        category,
        date,
        billable,
        taxAmount: tax,
        totalAmount,
        currency: 'USD',
        passThrough,
        markupPercent: parseFloat(markup) || 0,
        billableAmount,
        reimbursable,
        mileageMiles: props.mileageMode ? parseFloat(miles) : undefined,
        mileageRate: props.mileageMode ? rate : undefined,
        paymentMethod: reimbursable ? 'personal' : 'corporate_card',
        receiptAttachmentId,
        receiptUrl,
        status: 'draft',
        approved: false,
        invoiced: false,
        createdAt: now(),
        modifiedAt: now(),
        manualReceipt: {
          vendor: vendor || undefined, date, subtotal: baseAmount, tax,
          total: totalAmount, currency: 'USD', enteredById: props.userId, enteredAt: now(),
        },
      }
      if (props.expense) {
        await runPsaAction('expenses', props.expense.id, 'edit', props.workspaceId, { patch: {
          description: expense.description, vendor: expense.vendor, amount: expense.amount,
          category: expense.category, date: expense.date, billable: expense.billable,
          taxAmount: expense.taxAmount, totalAmount: expense.totalAmount,
          passThrough: expense.passThrough, markupPercent: expense.markupPercent,
          billableAmount: expense.billableAmount, reimbursable: expense.reimbursable,
          mileageMiles: expense.mileageMiles, mileageRate: expense.mileageRate,
          paymentMethod: expense.paymentMethod, manualReceipt: expense.manualReceipt,
          receiptAttachmentId: expense.receiptAttachmentId, receiptUrl: expense.receiptUrl,
        } })
      } else await add(expense)
      props.onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-sans text-xl">{props.expense ? 'Edit expense' : props.mileageMode ? 'Mileage' : 'Add expense'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          {props.mileageMode ? (
            <div className="grid gap-1"><Label>Miles</Label><Input value={miles} onChange={(e) => setMiles(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" /><p className="text-xs font-mono tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>@ {formatMoney(rate)}/mi = {formatMoney(baseAmount)}</p></div>
          ) : (
            <>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onReceipt(f) }} />
              <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{ocrHint || 'Manual vendor, date, amount, and tax entry remains available when receipt extraction is unavailable.'}</p>
              <Input placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" />
              <Input placeholder="Tax" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" />
            </>
          )}
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          <Input placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          <Select value={category} onValueChange={(v) => { setCategory(v as ExpenseCategory); setPassThrough(defaultPassThrough(v)) }}>
            <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">{Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={billable} onCheckedChange={setBillable} /> Billable</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={passThrough} onCheckedChange={setPassThrough} /> Pass-through</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={reimbursable} onCheckedChange={setReimbursable} /> Reimbursable</label>
          </div>
          {!passThrough && <Input placeholder="Markup %" value={markup} onChange={(e) => setMarkup(e.target.value)} className="rounded-md border border-input bg-background text-foreground font-mono tabular-nums" />}
          <p className="text-right font-mono tabular-nums text-sm">Billable: {formatMoney(billableAmount)}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
