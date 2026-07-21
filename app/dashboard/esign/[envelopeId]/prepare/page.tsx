'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowRight, FileText, GripVertical, Plus, Trash2, Upload } from 'lucide-react'

import { ComposerShell, type ComposerSaveState } from '@/components/esign/composer/ComposerShell'
import { participantColor } from '@/components/esign/pdf'
import { useDraftEnvelope } from '@/components/esign/wizard/EsignWizardFrame'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  useAddDocuments,
  useDeleteDocument,
  useEsignContext,
  useEsignTemplate,
  useReorderDocuments,
  useReplaceRecipients,
  useUpdateEnvelope,
} from '@/hooks/useEnvelopes'
import { apiClient, type EsignDocumentResponse, type EsignPdfWidget, type EsignRecipientInput } from '@/lib/api'
import { recipientValidationError } from '@/lib/esign/composerValidation'
import { hasEsignAccess } from '@/lib/esign/access'
import { cn } from '@/lib/utils'

interface RecipientRow {
  key: string
  id?: string
  name: string
  email: string
  role: EsignRole
  roleLabel?: string
  routingOrder: number
  privateMessage: string
  managedByRecipientId?: string
  witnessForRecipientId?: string
  witnessMode: 'remote' | 'in_person'
  hostName: string
  hostEmail: string
  allowReassignment: boolean
}

type EsignRole = 'signer' | 'cc' | 'approver' | 'certified_delivery' | 'agent' | 'editor' | 'witness' | 'in_person_signer'
const ROLE_OPTIONS: Array<{ value: EsignRole; label: string }> = [
  { value: 'signer', label: 'Signer' }, { value: 'cc', label: 'CC' },
  { value: 'approver', label: 'Approver' }, { value: 'certified_delivery', label: 'Certified delivery' },
  { value: 'agent', label: 'Agent' }, { value: 'editor', label: 'Editor' },
  { value: 'witness', label: 'Witness' }, { value: 'in_person_signer', label: 'In-person signer' },
]
const newRecipient = (routingOrder = 1): RecipientRow => ({ key: crypto.randomUUID(), name: '', email: '', role: 'signer', routingOrder, privateMessage: '', witnessMode: 'remote', hostName: '', hostEmail: '', allowReassignment: false })

function SortHandle({ id, label, disabled = false }: { id: string; label: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('grid size-9 shrink-0 touch-none place-items-center rounded-md text-foreground-subtle hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40', isDragging && 'opacity-50')}
      aria-label={`Reorder ${label}`}
      {...attributes}
      {...listeners}
    ><GripVertical className="size-4" /></button>
  )
}

export default function EnvelopePreparePage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params.envelopeId
  const router = useRouter()
  const { toast } = useToast()
  const envelopeQuery = useDraftEnvelope(envelopeId)
  const esignContext = useEsignContext()
  const envelope = envelopeQuery.data
  const templateId = envelope?.template_id ?? undefined
  const templateQuery = useEsignTemplate(templateId)
  const template = templateQuery.data
  const templateRoles = React.useMemo(
    () => [...((template?.recipient_roles as { label?: string; role?: string; routing_order?: number }[] | undefined) ?? [])].sort((a, b) => (a.routing_order ?? 1) - (b.routing_order ?? 1)),
    [template],
  )
  const templateLocked = !!templateId && templateRoles.length > 0
  const updateEnvelope = useUpdateEnvelope(envelopeId)
  const replaceRecipients = useReplaceRecipients(envelopeId)
  const addDocuments = useAddDocuments(envelopeId)
  const deleteDocument = useDeleteDocument(envelopeId)
  const reorderDocuments = useReorderDocuments(envelopeId)
  const [title, setTitle] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [signingType, setSigningType] = React.useState('sequential')
  const [allowReassignment, setAllowReassignment] = React.useState(false)
  const [dateFormat, setDateFormat] = React.useState('MM/DD/YYYY')
  const [reminderHours, setReminderHours] = React.useState('')
  const [expiresAt, setExpiresAt] = React.useState('')
  const [rows, setRows] = React.useState<RecipientRow[]>([])
  const [documents, setDocuments] = React.useState<EsignDocumentResponse[]>([])
  const [hydrated, setHydrated] = React.useState(false)
  const [saveState, setSaveState] = React.useState<ComposerSaveState>('idle')
  const [removeTarget, setRemoveTarget] = React.useState<{ type: 'document' | 'recipient'; id: string; label: string; fieldCount: number } | null>(null)
  const [widgetDialog, setWidgetDialog] = React.useState<{ documentId: string; widgets: EsignPdfWidget[] } | null>(null)
  const [widgetMappings, setWidgetMappings] = React.useState<Record<string, { recipient_id: string; field_type: 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'number' | 'date'; included: boolean; required: boolean; data_label: string }>>({})
  const [unsupportedConfirmed, setUnsupportedConfirmed] = React.useState(false)
  const [convertingWidgets, setConvertingWidgets] = React.useState(false)
  const lastMetadata = React.useRef('')
  const draftRevision = React.useRef(1)
  const saveQueue = React.useRef<Promise<void>>(Promise.resolve())
  const advancedRecipients = hasEsignAccess(esignContext.data, { feature: 'advanced_recipients', capability: 'advanced_recipients' })
  const sequentialRouting = signingType === 'sequential'
  const enqueueDraftSave = React.useCallback(<T extends { draft_revision: number },>(task: (revision: number) => Promise<T>) => {
    let result!: T
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      result = await task(draftRevision.current)
      draftRevision.current = result.draft_revision
    })
    saveQueue.current = operation
    return operation.then(() => result)
  }, [])

  React.useEffect(() => {
    if (!envelope || hydrated || (templateId && !template)) return
    setTitle(envelope.title)
    setMessage(envelope.message ?? '')
    setSigningType(envelope.signing_type)
    setAllowReassignment(envelope.allow_reassignment)
    setDateFormat(envelope.date_format)
    setReminderHours(envelope.reminder_interval_hours ? String(envelope.reminder_interval_hours) : '')
    setExpiresAt(envelope.expires_at ? envelope.expires_at.slice(0, 10) : '')
    setRows(envelope.recipients.length
      ? envelope.recipients.map((recipient, index) => ({ key: recipient.id, id: recipient.id, name: recipient.name ?? '', email: recipient.email ?? '', role: recipient.role as EsignRole, roleLabel: recipient.role_label ?? templateRoles[index]?.label, routingOrder: recipient.routing_order, privateMessage: recipient.private_message ?? '', managedByRecipientId: recipient.managed_by_recipient_id ?? undefined, witnessForRecipientId: recipient.witness_for_recipient_id ?? undefined, witnessMode: recipient.witness_mode ?? (recipient.email ? 'remote' : 'in_person'), hostName: recipient.host_name ?? '', hostEmail: recipient.host_email ?? '', allowReassignment: recipient.allow_reassignment }))
      : templateRoles.length
        ? templateRoles.map((role) => ({ ...newRecipient(role.routing_order ?? 1), role: (role.role as EsignRole) ?? 'signer', roleLabel: role.label || 'Recipient' }))
        : [newRecipient()])
    setDocuments([...envelope.documents].sort((a, b) => a.display_order - b.display_order))
    lastMetadata.current = JSON.stringify({ title: envelope.title, message: envelope.message ?? '', signingType: envelope.signing_type, allowReassignment: envelope.allow_reassignment, dateFormat: envelope.date_format, reminderHours: envelope.reminder_interval_hours ? String(envelope.reminder_interval_hours) : '', expiresAt: envelope.expires_at ? envelope.expires_at.slice(0, 10) : '' })
    draftRevision.current = envelope.draft_revision
    setHydrated(true)
  }, [envelope, hydrated, template, templateId, templateRoles])

  React.useEffect(() => {
    if (!hydrated) return
    const snapshot = JSON.stringify({ title, message, signingType, allowReassignment, dateFormat, reminderHours, expiresAt })
    if (snapshot === lastMetadata.current || !title.trim()) return
    const timer = window.setTimeout(async () => {
      setSaveState('saving')
      try {
        await enqueueDraftSave((revision) => updateEnvelope.mutateAsync({
          expected_revision: revision,
          title: title.trim(),
          message,
          signing_type: signingType,
          allow_reassignment: allowReassignment,
          date_format: dateFormat as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM D, YYYY',
          reminder_interval_hours: reminderHours ? Number(reminderHours) : null,
          expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        }))
        lastMetadata.current = snapshot
        setSaveState('saved')
      } catch (error) {
        setSaveState('error')
        toast({ title: 'Draft changes were not saved', description: error instanceof Error ? error.message : 'Reload before continuing.', variant: 'destructive' })
      }
    }, 750)
    return () => window.clearTimeout(timer)
  }, [allowReassignment, dateFormat, enqueueDraftSave, expiresAt, hydrated, message, reminderHours, signingType, title, toast, updateEnvelope])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const saveRecipients = React.useCallback(async (nextRows: RecipientRow[], quiet = false) => {
    const error = recipientValidationError(nextRows)
    if (error) { if (!quiet) toast({ title: error, variant: 'destructive' }); return false }
    setSaveState('saving')
    try {
      const complete = nextRows.filter((row) => row.name.trim() || row.email.trim() || row.managedByRecipientId || row.role === 'witness' || row.role === 'in_person_signer')
      await enqueueDraftSave((revision) => replaceRecipients.mutateAsync({
        recipients: complete.map((row) => ({ id: row.id, name: row.name.trim() || null, email: row.email.trim().toLowerCase() || null, role: row.role, routing_order: row.routingOrder, role_label: row.roleLabel, private_message: row.privateMessage || null, managed_by_recipient_id: row.managedByRecipientId, witness_for_recipient_id: row.witnessForRecipientId, witness_mode: row.role === 'witness' ? row.witnessMode : null, host_name: row.hostName || null, host_email: row.hostEmail.trim().toLowerCase() || null, allow_reassignment: row.allowReassignment })) as EsignRecipientInput[],
        templateId,
        expectedRevision: revision,
      }))
      setSaveState('saved')
      return true
    } catch (error) {
      setSaveState('error')
      if (!quiet) toast({ title: 'Could not save recipients', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
      return false
    }
  }, [enqueueDraftSave, replaceRecipients, templateId, toast])

  const onDocumentDrag = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = documents.findIndex((item) => item.id === active.id)
    const to = documents.findIndex((item) => item.id === over.id)
    const next = arrayMove(documents, from, to)
    setDocuments(next)
    setSaveState('saving')
    try { await enqueueDraftSave(() => reorderDocuments.mutateAsync(next.map((item) => item.id))); setSaveState('saved') }
    catch (error) { setDocuments(documents); setSaveState('error'); toast({ title: 'Could not reorder documents', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }

  const onRecipientDrag = ({ active, over }: DragEndEvent) => {
    if (templateLocked || !sequentialRouting) return
    if (!over || active.id === over.id) return
    const from = rows.findIndex((item) => item.key === active.id)
    const to = rows.findIndex((item) => item.key === over.id)
    const next = arrayMove(rows, from, to).map((item, index) => ({ ...item, routingOrder: index + 1 }))
    setRows(next)
    void saveRecipients(next, true)
  }

  const continueToFields = async () => {
    if (!await saveRecipients(rows)) return
    router.push(`/dashboard/esign/${envelopeId}/fields`)
  }

  const inspectWidgets = async (documentId: string) => {
    try {
      const result = await apiClient.inspectEsignPdfWidgets(envelopeId, documentId)
      if (!(result.widgets ?? []).length) { toast({ title: 'No fillable PDF fields found' }); return }
      const firstSigner = envelope?.recipients.find((recipient) => recipient.role === 'signer')?.id ?? ''
      const mappings: typeof widgetMappings = {}
      for (const widget of result.widgets ?? []) mappings[widget.widget_id] = { recipient_id: firstSigner, field_type: (widget.suggested_field_type || 'text') as typeof mappings[string]['field_type'], included: widget.supported, required: widget.required, data_label: widget.name }
      setUnsupportedConfirmed(false); setWidgetMappings(mappings); setWidgetDialog({ documentId, widgets: result.widgets ?? [] })
    } catch (error) { toast({ title: 'Could not inspect PDF fields', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }

  const convertWidgets = async () => {
    if (!widgetDialog) return
    setConvertingWidgets(true)
    try {
      const result = await enqueueDraftSave(() => apiClient.convertEsignPdfWidgets(envelopeId, widgetDialog.documentId, { mappings: widgetDialog.widgets.flatMap((widget) => {
        const mapping = widgetMappings[widget.widget_id]
        return mapping?.included && mapping.recipient_id ? [{ widget_id: widget.widget_id, recipient_id: mapping.recipient_id, field_type: mapping.field_type, required: mapping.required, data_label: mapping.data_label }] : []
      }), confirm_unsupported_flatten: unsupportedConfirmed }))
      draftRevision.current = result.draft_revision
      toast({ title: 'PDF fields converted', description: 'Review their placement and ownership on the Fields step.' })
      setWidgetDialog(null)
    } catch (error) { toast({ title: 'Could not convert PDF fields', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
    finally { setConvertingWidgets(false) }
  }

  return (
    <ComposerShell title={title || envelope?.title || 'Untitled envelope'} onTitleChange={setTitle} stage="prepare" saveState={saveState} onClose={() => router.push('/dashboard/esign')} primary={<Button onClick={continueToFields} disabled={!envelope || documents.length === 0 || replaceRecipients.isPending}>Next <ArrowRight className="ml-1.5 size-4" /></Button>}>
      <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold">Documents</h2><p className="text-sm text-foreground-muted">Drag to set the order signers will review.</p></div><Upload className="size-5 text-foreground-subtle" /></div>
            <Dropzone onFiles={async (files) => { const pdfs = files.filter((file) => file.name.toLowerCase().endsWith('.pdf')); if (pdfs.length !== files.length) toast({ title: 'Only PDF files are supported', variant: 'destructive' }); if (!pdfs.length) return; try { const result = await enqueueDraftSave(() => addDocuments.mutateAsync(pdfs)); setDocuments([...result.documents].sort((a, b) => a.display_order - b.display_order)) } catch (error) { toast({ title: 'Upload failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }} accept="application/pdf,.pdf" title="Drop PDFs here or browse" description="PDF only, up to 25 MB each." />
            {documents.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDocumentDrag}><SortableContext items={documents.map((item) => item.id)} strategy={verticalListSortingStrategy}><ul className="mt-4 divide-y divide-border rounded-lg border border-border">{documents.map((document) => <li key={document.id} className="flex items-center gap-2 px-2 py-2.5"><SortHandle id={document.id} label={document.original_filename} /><FileText className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{document.original_filename}</span><span className="text-xs text-foreground-subtle">{document.page_count} page{document.page_count === 1 ? '' : 's'}</span><Button variant="outline" size="sm" onClick={() => void inspectWidgets(document.id)}>Convert PDF fields</Button><Button variant="ghost" size="icon" disabled={documents.length <= 1} onClick={() => setRemoveTarget({ type: 'document', id: document.id, label: document.original_filename, fieldCount: envelope?.fields.filter((field) => field.document_id === document.id).length ?? 0 })} aria-label={`Remove ${document.original_filename}`}><Trash2 className="size-4" /></Button></li>)}</ul></SortableContext></DndContext>}
          </section>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4"><h2 className="font-semibold">Recipients</h2><p className="text-sm text-foreground-muted">{sequentialRouting ? 'Set explicit routing steps. Recipients with the same step act in parallel.' : 'All actionable recipients can act as soon as the envelope is sent.'}</p></div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRecipientDrag}><SortableContext items={rows.map((item) => item.key)} strategy={verticalListSortingStrategy}><div className="space-y-2">{rows.map((row, index) => { const color = participantColor(index); const update = (changes: Partial<RecipientRow>) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, ...changes } : item)); return <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">{sequentialRouting && <SortHandle id={row.key} label={row.name || `recipient ${index + 1}`} disabled={templateLocked} />}<span className="mb-3 size-2.5 rounded-full" style={{ background: color.border }} /><div className="min-w-36 flex-1"><Label className="text-xs">Name</Label><Input value={row.name} onChange={(event) => update({ name: event.target.value })} onBlur={() => void saveRecipients(rows, true)} placeholder={row.managedByRecipientId ? 'Resolved by manager' : 'Jane Client'} /></div><div className="min-w-48 flex-[1.2]"><Label className="text-xs">Email</Label><Input type="email" value={row.email} onChange={(event) => update({ email: event.target.value })} onBlur={() => void saveRecipients(rows, true)} placeholder={row.managedByRecipientId ? 'Resolved by manager' : 'jane@client.com'} /></div>{sequentialRouting && <div className="w-20"><Label className="text-xs">Step</Label><Input type="number" min={1} value={row.routingOrder} onChange={(event) => update({ routingOrder: Math.max(1, Number(event.target.value) || 1) })} onBlur={() => void saveRecipients(rows, true)} /></div>}<div className="w-44"><Label className="text-xs">Role</Label><Select value={row.role} disabled={templateLocked} onValueChange={(role) => { const next = rows.map((item) => item.key === row.key ? { ...item, role: role as EsignRole } : item); setRows(next); void saveRecipients(next, true) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.filter((option) => advancedRecipients || ['signer', 'cc'].includes(option.value)).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>{!templateLocked && <Button variant="ghost" size="icon" disabled={rows.length <= 1} onClick={() => setRemoveTarget({ type: 'recipient', id: row.key, label: row.name || row.email || 'this recipient', fieldCount: envelope?.fields.filter((field) => field.recipient_id === row.id).length ?? 0 })} aria-label={`Remove ${row.name || 'recipient'}`}><Trash2 className="size-4" /></Button>}{advancedRecipients && <div className="grid w-full gap-2 border-t border-border pt-3 sm:grid-cols-2"><div><Label className="text-xs">Private message</Label><Input value={row.privateMessage} onChange={(event) => update({ privateMessage: event.target.value })} onBlur={() => void saveRecipients(rows, true)} placeholder="Visible only to this recipient" /></div><div><Label className="text-xs">Role label</Label><Input value={row.roleLabel ?? ''} onChange={(event) => update({ roleLabel: event.target.value })} onBlur={() => void saveRecipients(rows, true)} placeholder="Client, reviewer, witness…" /></div>{['signer', 'approver', 'certified_delivery'].includes(row.role) && <div><Label className="text-xs">Managed by</Label><Select value={row.managedByRecipientId ?? 'none'} onValueChange={(value) => update({ managedByRecipientId: value === 'none' ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not managed</SelectItem>{rows.filter((item) => item.id && ['agent', 'editor'].includes(item.role)).map((item) => <SelectItem key={item.id} value={item.id!}>{item.name || item.roleLabel || item.role}</SelectItem>)}</SelectContent></Select></div>}{row.role === 'witness' && <div><Label className="text-xs">Witness for</Label><Select value={row.witnessForRecipientId ?? ''} onValueChange={(value) => { const signer = rows.find((item) => item.id === value); update({ witnessForRecipientId: value, routingOrder: signer?.routingOrder ?? row.routingOrder }) }}><SelectTrigger><SelectValue placeholder="Choose signer" /></SelectTrigger><SelectContent>{rows.filter((item) => item.id && item.role === 'signer').map((item) => <SelectItem key={item.id} value={item.id!}>{item.name || 'Signer'}</SelectItem>)}</SelectContent></Select></div>}{row.role === 'in_person_signer' && <><div><Label className="text-xs">Host name</Label><Input value={row.hostName} onChange={(event) => update({ hostName: event.target.value })} /></div><div><Label className="text-xs">Host email</Label><Input type="email" value={row.hostEmail} onChange={(event) => update({ hostEmail: event.target.value })} onBlur={() => void saveRecipients(rows, true)} /></div></>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.allowReassignment} onChange={(event) => update({ allowReassignment: event.target.checked })} /> Allow reassignment</label></div>}</div> })}</div></SortableContext></DndContext>
            {!templateLocked && <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows((current) => [...current, newRecipient(Math.max(0, ...current.map((item) => item.routingOrder)) + 1)])}><Plus className="mr-1.5 size-4" /> Add recipient</Button>}
            {recipientValidationError(rows) && <p className="mt-3 text-sm text-warning" role="status">{recipientValidationError(rows)}</p>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="mb-4 font-semibold">Message</h2><Label htmlFor="prepare-message">Email message</Label><Textarea id="prepare-message" rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add a note for recipients…" /></section>
          <section className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Delivery settings</h2><div><Label>Signing order</Label><Select value={signingType} onValueChange={setSigningType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sequential">Routing steps</SelectItem><SelectItem value="parallel">All actionable recipients</SelectItem></SelectContent></Select></div>{advancedRecipients && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowReassignment} onChange={(event) => setAllowReassignment(event.target.checked)} /> Permit recipient reassignment</label>}<div><Label>Date format</Label><Select value={dateFormat} onValueChange={setDateFormat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem><SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem><SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem><SelectItem value="MMM D, YYYY">MMM D, YYYY</SelectItem></SelectContent></Select></div><div><Label htmlFor="prepare-expires">Expiration date</Label><Input id="prepare-expires" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div><div><Label htmlFor="prepare-reminders">Remind every (hours)</Label><Input id="prepare-reminders" type="number" min={1} max={720} value={reminderHours} onChange={(event) => setReminderHours(event.target.value)} /></div></section>
        </aside>
      </div>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {removeTarget?.type}?</AlertDialogTitle><AlertDialogDescription>Removing “{removeTarget?.label}” will also remove {removeTarget?.fieldCount ?? 0} placed field{removeTarget?.fieldCount === 1 ? '' : 's'} assigned to it. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => { if (!removeTarget) return; if (removeTarget.type === 'document') { try { const result = await enqueueDraftSave(() => deleteDocument.mutateAsync(removeTarget.id)); setDocuments([...result.documents].sort((a, b) => a.display_order - b.display_order)) } catch (error) { toast({ title: 'Could not remove document', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } } else { const next = rows.filter((row) => row.key !== removeTarget.id); setRows(next); await saveRecipients(next) } setRemoveTarget(null) }}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog open={!!widgetDialog} onOpenChange={(open) => { if (!open) setWidgetDialog(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Review PDF form fields</DialogTitle><DialogDescription>Review the detected defaults, options, required state, data labels, and signing role before conversion.</DialogDescription></DialogHeader>
          <div className="space-y-3">{widgetDialog?.widgets.map((widget) => {
            const mapping = widgetMappings[widget.widget_id]
            if (!widget.supported) return <div key={widget.widget_id} className="rounded border border-warning/40 bg-warning-soft p-3 text-sm"><p className="font-medium">Unsupported widget · {widget.name}</p><p className="text-xs text-foreground-muted">Page {widget.page_number + 1}. This widget cannot become a signing field and will be flattened into the completed PDF after confirmation.</p></div>
            return <div key={widget.widget_id} className="space-y-2 rounded border border-border p-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-[auto_1fr_130px_190px]"><input aria-label={`Convert ${widget.name}`} type="checkbox" checked={mapping?.included ?? false} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], included: event.target.checked } }))} /><span title={widget.tooltip ?? widget.name}><span className="font-medium">{widget.name}</span><span className="block text-xs text-foreground-muted">Page {widget.page_number + 1}{widget.default_value ? ` · Default: ${widget.default_value}` : ''}{(widget.choices ?? []).length ? ` · Options: ${(widget.choices ?? []).join(', ')}` : ''}</span></span><select className="rounded border border-border bg-background p-1" value={mapping?.field_type ?? 'text'} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], field_type: event.target.value as typeof mapping.field_type } }))}>{['text', 'signature', 'checkbox', 'radio', 'dropdown', 'number', 'date'].map((type) => <option key={type} value={type}>{type}</option>)}</select><select className="rounded border border-border bg-background p-1" value={mapping?.recipient_id ?? ''} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], recipient_id: event.target.value } }))}><option value="">Choose signing role…</option>{envelope?.recipients.filter((recipient) => ['signer', 'witness', 'in_person_signer'].includes(recipient.role)).map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name || recipient.role_label || recipient.role.replace(/_/g, ' ')} · {recipient.role.replace(/_/g, ' ')}</option>)}</select></div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input aria-label={`${widget.name} data label`} value={mapping?.data_label ?? widget.name} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], data_label: event.target.value } }))} /><label className="flex items-center gap-2"><input type="checkbox" checked={mapping?.required ?? false} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], required: event.target.checked } }))} /> Required</label></div>
            </div>
          })}</div>
          {widgetDialog?.widgets.some((widget) => !widget.supported) && <label className="flex items-start gap-2 rounded border border-warning/40 bg-warning-soft p-3 text-sm"><input className="mt-0.5" type="checkbox" checked={unsupportedConfirmed} onChange={(event) => setUnsupportedConfirmed(event.target.checked)} /><span>I confirm unsupported widgets cannot be converted and may be flattened in the completed document.</span></label>}
          <DialogFooter><Button variant="outline" onClick={() => setWidgetDialog(null)}>Cancel</Button><Button onClick={convertWidgets} disabled={convertingWidgets || (widgetDialog?.widgets.some((widget) => !widget.supported) && !unsupportedConfirmed) || !Object.values(widgetMappings).some((mapping) => mapping.included && mapping.recipient_id)}>Convert selected</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </ComposerShell>
  )
}
