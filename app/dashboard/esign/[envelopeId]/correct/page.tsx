'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Copy, Loader2, Plus, Save, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useEnvelope } from '@/hooks/useEnvelopes'
import { apiClient, type EsignFieldInput, type EsignRecipientInput } from '@/lib/api'
import { recipientValidationError } from '@/lib/esign/composerValidation'
import { canRecipientReassign } from '@/lib/esign/reassignment'
import { PdfFieldEditor, coerceEditorProperties, type EditorField, type EditorFieldType } from '@/components/esign/editor/PdfFieldEditor'

const ROLES = ['signer', 'cc', 'approver', 'certified_delivery', 'agent', 'editor', 'witness', 'in_person_signer'] as const

export default function CorrectRecipientsPage() {
  const { envelopeId } = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const query = useEnvelope(envelopeId)
  const [rows, setRows] = React.useState<EsignRecipientInput[]>([])
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const [fields, setFields] = React.useState<EditorField[]>([])
  const [initialFields, setInitialFields] = React.useState('')
  const [replacementFiles, setReplacementFiles] = React.useState<Record<string, File | undefined>>({})
  const envelope = query.data
  const documentUrls = useQuery({
    queryKey: ['esign', 'correction-doc-urls', envelopeId, envelope?.routing_version],
    queryFn: async () => Object.fromEntries(await Promise.all((envelope?.documents ?? []).map(async (document) => [document.id, (await apiClient.getEsignDocumentDownload(envelopeId, document.id)).url]))),
    enabled: !!envelope?.documents.length,
  })

  React.useEffect(() => {
    if (!envelope || hydrated) return
    setRows(envelope.recipients.map((recipient) => ({
      id: recipient.id, name: recipient.name, email: recipient.email, role: recipient.role as typeof ROLES[number],
      routing_order: recipient.routing_order, role_label: recipient.role_label,
      private_message: recipient.private_message, managed_by_recipient_id: recipient.managed_by_recipient_id,
      witness_for_recipient_id: recipient.witness_for_recipient_id, host_name: recipient.host_name,
      witness_mode: recipient.witness_mode, host_email: recipient.host_email, allow_reassignment: recipient.allow_reassignment,
    })))
    const editableRecipientIds = new Set(envelope.recipients.filter((recipient) => !recipient.action_completed_at).map((recipient) => recipient.id))
    const initialEditorFields = envelope.fields.filter((field) => editableRecipientIds.has(field.recipient_id)).map((field) => ({
      id: field.id, documentId: field.document_id, participantId: field.recipient_id,
      fieldType: field.field_type as EditorFieldType, pageNumber: field.page_number,
      posX: field.pos_x, posY: field.pos_y, width: field.width, height: field.height,
      required: field.required, label: field.label ?? undefined,
      properties: coerceEditorProperties(field.properties),
    }))
    setFields(initialEditorFields)
    setInitialFields(JSON.stringify(initialEditorFields))
    setHydrated(true)
  }, [envelope, hydrated])

  if (query.isLoading || !envelope) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="mr-2 size-5 animate-spin" /> Loading recipients…</div>
  const completed = new Set(envelope.recipients.filter((recipient) => recipient.action_completed_at).map((recipient) => recipient.id))
  const initial = new Map(envelope.recipients.map((recipient) => [recipient.id, recipient]))
  const changed = rows.filter((row) => {
    const before = row.id ? initial.get(row.id) : undefined
    if (!before) return true
    return JSON.stringify(row) !== JSON.stringify({
      id: before.id, name: before.name, email: before.email, role: before.role,
      routing_order: before.routing_order, role_label: before.role_label,
      private_message: before.private_message, managed_by_recipient_id: before.managed_by_recipient_id,
      witness_for_recipient_id: before.witness_for_recipient_id, witness_mode: before.witness_mode,
      host_name: before.host_name, host_email: before.host_email,
      allow_reassignment: before.allow_reassignment,
    })
  }).length + envelope.recipients.filter((recipient) => !rows.some((row) => row.id === recipient.id)).length
  const validationError = recipientValidationError(rows.map((row) => ({
    name: row.name ?? '', email: row.email ?? '', role: row.role,
    managedByRecipientId: row.managed_by_recipient_id ?? undefined,
    witnessForRecipientId: row.witness_for_recipient_id ?? undefined,
    witnessMode: row.witness_mode ?? undefined,
    hostName: row.host_name ?? undefined, hostEmail: row.host_email ?? undefined,
  })))
  const fieldsChanged = JSON.stringify(fields) !== initialFields

  const save = async () => {
    if (!reason.trim() || validationError) { toast({ title: validationError || 'Enter a reason for this correction', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const corrected = changed > 0
        ? await apiClient.correctEsignRecipients(envelopeId, { recipients: rows, reason: reason.trim(), expected_routing_version: envelope.routing_version })
        : envelope
      if (fieldsChanged) await apiClient.correctEsignFields(envelopeId, {
        reason: reason.trim(), expected_routing_version: corrected.routing_version,
        fields: fields.map((field) => ({
          id: field.id, document_id: field.documentId, recipient_id: field.participantId,
          field_type: field.fieldType, page_number: field.pageNumber,
          pos_x: field.posX, pos_y: field.posY, width: field.width, height: field.height,
          required: field.required, label: field.label,
          properties: field.properties as EsignFieldInput['properties'],
        })),
      })
      toast({ title: 'Correction committed', description: 'Routing, access links, consent, and notifications were recalculated.' })
      router.push(`/dashboard/esign/${envelopeId}`)
    } catch (error) {
      toast({ title: 'Correction could not be committed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-foreground-muted">E-Signature · routing version {envelope.routing_version}</p><h1 className="text-2xl font-semibold">Correct recipients</h1><p className="text-sm text-foreground-muted">Completed recipients are locked. Outstanding identities, roles, managers, witnesses, and hosts can be corrected{envelope.allow_reassignment ? ', including which eligible recipients may reassign their step' : ''}{envelope.signing_type === 'sequential' ? ', along with their routing steps' : ''}.</p>{!envelope.allow_reassignment && <p className="mt-1 text-xs text-foreground-subtle">Recipient reassignment is off for this envelope and cannot be enabled after sending.</p>}</div><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-1.5 size-4" /> Cancel</Button></div>
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5">{rows.map((row, index) => {
      const locked = !!row.id && completed.has(row.id)
      const hasFields = !!row.id && envelope.fields.some((field) => field.recipient_id === row.id)
      const signatureRoles = ['signer', 'witness', 'in_person_signer']
      const allowedRoles = !row.id ? ROLES.filter((role) => !signatureRoles.includes(role)) : hasFields ? ROLES.filter((role) => signatureRoles.includes(role)) : ROLES.filter((role) => !signatureRoles.includes(role) || role === row.role)
      const update = (changes: Partial<EsignRecipientInput>) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
      return <div key={row.id ?? index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-2 lg:grid-cols-4">
        <div><Label className="text-xs">Name</Label><Input disabled={locked} value={row.name ?? ''} onChange={(event) => update({ name: event.target.value || null })} /></div>
        <div><Label className="text-xs">Email</Label><Input disabled={locked} type="email" value={row.email ?? ''} onChange={(event) => update({ email: event.target.value || null })} /></div>
        <div><Label className="text-xs">Role</Label><Select disabled={locked} value={row.role} onValueChange={(role) => update({ role: role as typeof row.role, allow_reassignment: canRecipientReassign(role) ? row.allow_reassignment : false })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{allowedRoles.map((role) => <SelectItem key={role} value={role}>{role.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-end justify-end gap-2">{envelope.signing_type === 'sequential' && <div className="flex-1"><Label className="text-xs">Step</Label><Input disabled={locked} type="number" min={1} value={row.routing_order} onChange={(event) => update({ routing_order: Math.max(1, Number(event.target.value) || 1) })} /></div>}<Button variant="ghost" size="icon" disabled={locked} onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></Button></div>
        <div><Label className="text-xs">Role label</Label><Input disabled={locked} value={row.role_label ?? ''} onChange={(event) => update({ role_label: event.target.value || null })} /></div>
        <div><Label className="text-xs">Private message</Label><Input disabled={locked} value={row.private_message ?? ''} onChange={(event) => update({ private_message: event.target.value || null })} /></div>
        {['signer', 'approver', 'certified_delivery'].includes(row.role) && <div><Label className="text-xs">Who enters recipient details?</Label><Select disabled={locked} value={row.managed_by_recipient_id ?? 'none'} onValueChange={(value) => update({ managed_by_recipient_id: value === 'none' ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sender enters them now</SelectItem>{rows.filter((item) => item.id && ['agent', 'editor'].includes(item.role)).map((manager) => <SelectItem key={manager.id} value={manager.id!}>{manager.name || manager.role_label || manager.role}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-foreground-muted">Choose an Agent or Editor to enter this recipient’s name and email before the recipient’s step.</p></div>}
        {row.role === 'witness' && <><div><Label className="text-xs">Witness for</Label><Select disabled={locked} value={row.witness_for_recipient_id ?? ''} onValueChange={(value) => update({ witness_for_recipient_id: value })}><SelectTrigger><SelectValue placeholder="Choose signer" /></SelectTrigger><SelectContent>{rows.filter((item) => item.id && item.role === 'signer').map((signer) => <SelectItem key={signer.id} value={signer.id!}>{signer.name || 'Signer'}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">Witness mode</Label><Select disabled={locked} value={row.witness_mode ?? 'remote'} onValueChange={(value) => update({ witness_mode: value as 'remote' | 'in_person' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="remote">Remote</SelectItem><SelectItem value="in_person">In person</SelectItem></SelectContent></Select></div></>}
        {row.role === 'in_person_signer' && <><div><Label className="text-xs">Host name</Label><Input disabled={locked} value={row.host_name ?? ''} onChange={(event) => update({ host_name: event.target.value || null })} /></div><div><Label className="text-xs">Host email</Label><Input disabled={locked} type="email" value={row.host_email ?? ''} onChange={(event) => update({ host_email: event.target.value || null })} /></div></>}
        {envelope.allow_reassignment && canRecipientReassign(row.role) && <label className="flex items-center gap-2 self-end text-sm"><input disabled={locked} type="checkbox" checked={row.allow_reassignment ?? false} onChange={(event) => update({ allow_reassignment: event.target.checked })} /> May reassign this step</label>}
      </div>
    })}<Button variant="outline" onClick={() => setRows((current) => [...current, { name: '', email: '', role: 'approver', routing_order: Math.max(0, ...current.map((row) => row.routing_order)) + 1, allow_reassignment: false }])}><Plus className="mr-1.5 size-4" /> Add recipient</Button></section>
    {documentUrls.data && fields.length > 0 && <section className="space-y-3 rounded-lg border border-border bg-surface p-5"><div><h2 className="font-semibold">Outstanding recipient fields</h2><p className="text-sm text-foreground-muted">Only fields belonging to incomplete recipients are editable. Saving increments the routing revision and invalidates their outstanding access and consent.</p></div><PdfFieldEditor documents={envelope.documents.map((document) => ({ id: document.id, name: document.original_filename, url: documentUrls.data[document.id], pageCount: document.page_count }))} participants={envelope.recipients.filter((recipient) => !recipient.action_completed_at && ['signer', 'witness', 'in_person_signer'].includes(recipient.role)).map((recipient) => ({ id: recipient.id, label: recipient.name || recipient.role_label || recipient.role.replace(/_/g, ' ') }))} fields={fields} onChange={setFields} /></section>}
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5"><div><h2 className="font-semibold">Document correction</h2><p className="text-sm text-foreground-muted">Original documents may be replaced with a PDF or Word (.docx) document only before any recipient completes. Existing field pages must remain valid.</p></div>{envelope.recipients.some((recipient) => recipient.action_completed_at) ? <div className="space-y-3 rounded border border-warning/40 bg-warning-soft p-3 text-sm"><p>A recipient has completed, so this envelope&apos;s document evidence is immutable. Create an editable draft copy and void the original in one operation.</p><Button variant="outline" disabled={!reason.trim() || saving} onClick={async () => { setSaving(true); try { const result = await apiClient.cloneAndVoidEsignEnvelope(envelopeId, reason.trim(), envelope.routing_version); toast({ title: 'Envelope cloned and original voided', description: 'Review the new draft before sending it.' }); router.push(`/dashboard/esign/${result.clone.id}/prepare`) } catch (error) { toast({ title: 'Envelope could not be cloned and voided', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } finally { setSaving(false) } }}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Copy className="mr-2 size-4" />} Clone and void</Button></div> : envelope.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm">{document.original_filename}</span><Input className="max-w-xs" type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => setReplacementFiles((current) => ({ ...current, [document.id]: event.target.files?.[0] }))} /><Button variant="outline" disabled={!replacementFiles[document.id] || !reason.trim() || saving} onClick={async () => { const file = replacementFiles[document.id]; if (!file) return; setSaving(true); try { await apiClient.replaceActiveEsignDocument(envelopeId, document.id, file, reason.trim(), envelope.routing_version); toast({ title: 'Document replaced', description: 'Outstanding links and consent were invalidated; recipients will be re-notified.' }); router.push(`/dashboard/esign/${envelopeId}`) } catch (error) { toast({ title: 'Document could not be replaced', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } finally { setSaving(false) } }}>Replace</Button></div>)}</section>
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5"><p className="text-sm font-medium">Change summary: {changed} recipient change{changed === 1 ? '' : 's'}{fieldsChanged ? ' · field layout changed' : ''}</p>{validationError && <p className="text-sm text-warning">{validationError}</p>}<div><Label htmlFor="correction-reason">Required reason</Label><Textarea id="correction-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why recipient routing, documents, or fields are being corrected…" /></div><Button disabled={saving || (changed === 0 && !fieldsChanged) || !reason.trim() || !!validationError} onClick={() => void save()}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />} Commit correction</Button></section>
  </div>
}
