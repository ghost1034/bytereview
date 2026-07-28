'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2, Save, Send } from 'lucide-react'

import { ComposerShell, type ComposerSaveState } from '@/components/esign/composer/ComposerShell'
import {
  PdfFieldEditor,
  coerceEditorProperties,
  type EditorField,
  type EditorFieldType,
} from '@/components/esign/editor/PdfFieldEditor'
import { useDraftEnvelope } from '@/components/esign/wizard/EsignWizardFrame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { useReplaceFields, useSaveAsTemplate, useScheduleEnvelope, useSendEnvelope } from '@/hooks/useEnvelopes'
import { ApiError, apiClient, type EsignFieldInput, type EsignFieldResponse, type EsignPdfWidget } from '@/lib/api'
import { collectFieldIssues } from '@/lib/esign/composerValidation'

type WidgetMapping = {
  recipient_id: string
  field_type: 'text' | 'signature' | 'checkbox' | 'radio' | 'dropdown' | 'number' | 'date'
  included: boolean
  required: boolean
  data_label: string
}

function toEditorFields(fields: EsignFieldResponse[]): EditorField[] {
  return fields.map((field) => ({
    id: field.id,
    documentId: field.document_id,
    participantId: field.recipient_id,
    fieldType: field.field_type as EditorFieldType,
    pageNumber: field.page_number,
    posX: field.pos_x,
    posY: field.pos_y,
    width: field.width,
    height: field.height,
    required: field.required,
    label: field.label ?? undefined,
    properties: coerceEditorProperties(field.properties),
  }))
}

export default function EnvelopeFieldsPage() {
  const { envelopeId } = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const envelopeQuery = useDraftEnvelope(envelopeId)
  const envelope = envelopeQuery.data
  const replaceFields = useReplaceFields(envelopeId)
  const sendEnvelope = useSendEnvelope(envelopeId)
  const scheduleEnvelope = useScheduleEnvelope(envelopeId)
  const saveAsTemplate = useSaveAsTemplate(envelopeId)
  const [editorFields, setEditorFields] = React.useState<EditorField[]>([])
  const [hydrated, setHydrated] = React.useState(false)
  const [saveState, setSaveState] = React.useState<ComposerSaveState>('idle')
  const [reviewOpen, setReviewOpen] = React.useState(searchParams.get('review') === 'open')
  const [focusFieldId, setFocusFieldId] = React.useState<string | null>(null)
  const [templateName, setTemplateName] = React.useState('')
  const [scheduleAt, setScheduleAt] = React.useState('')
  const [widgetDialog, setWidgetDialog] = React.useState<{ documentId: string; widgets: EsignPdfWidget[] } | null>(null)
  const [widgetMappings, setWidgetMappings] = React.useState<Record<string, WidgetMapping>>({})
  const [unsupportedConfirmed, setUnsupportedConfirmed] = React.useState(false)
  const [inspectingWidgets, setInspectingWidgets] = React.useState(false)
  const [convertingWidgets, setConvertingWidgets] = React.useState(false)
  const lastSaved = React.useRef('')
  const queuedSnapshot = React.useRef('')
  const draftRevision = React.useRef(1)
  const saveQueue = React.useRef<Promise<boolean>>(Promise.resolve(true))

  React.useEffect(() => {
    // A stale cached envelope may be present while this newly mounted wizard
    // step refetches. Wait for that refetch before capturing draft_revision;
    // otherwise the first autosave is guaranteed to conflict with the server.
    if (!envelope || envelopeQuery.isFetching || hydrated) return
    const initial = toEditorFields(envelope.fields)
    setEditorFields(initial)
    lastSaved.current = JSON.stringify(initial)
    draftRevision.current = envelope.draft_revision
    setHydrated(true)
  }, [envelope, envelopeQuery.isFetching, hydrated])

  const payload = React.useCallback((fields: EditorField[]) => fields.map((field) => ({
    id: field.id,
    document_id: field.documentId,
    recipient_id: field.participantId,
    field_type: field.fieldType,
    page_number: field.pageNumber,
    pos_x: field.posX,
    pos_y: field.posY,
    width: field.width,
    height: field.height,
    required: field.required,
    label: field.label,
    properties: field.properties as EsignFieldInput['properties'],
  })), [])

  const saveNow = React.useCallback(async () => {
    const snapshot = JSON.stringify(editorFields)
    if (snapshot === lastSaved.current) return true
    if (snapshot === queuedSnapshot.current) return saveQueue.current
    queuedSnapshot.current = snapshot
    const fields = editorFields.map((field) => ({ ...field, properties: structuredClone(field.properties ?? {}) }))
    const operation = saveQueue.current.catch(() => false).then(async () => {
      if (snapshot === lastSaved.current) return true
      setSaveState('saving')
      try {
        const persist = () => replaceFields.mutateAsync({ fields: payload(fields), expectedRevision: draftRevision.current })
        let saved: Awaited<ReturnType<typeof persist>>
        try {
          saved = await persist()
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error

          // A different wizard save may have advanced the revision without
          // touching fields. Rebase only in that safe case; genuine concurrent
          // field edits must still surface as a conflict instead of being lost.
          const latest = await apiClient.getEsignEnvelope(envelopeId)
          if (JSON.stringify(toEditorFields(latest.fields)) !== lastSaved.current) throw error
          draftRevision.current = latest.draft_revision
          saved = await persist()
        }
        draftRevision.current = saved.draft_revision
        lastSaved.current = snapshot
        if (queuedSnapshot.current === snapshot) setSaveState('saved')
        return true
      } catch (error) {
        // Do not permanently memoize a failed snapshot. Review/send and the
        // next autosave must be able to retry without requiring a page reload.
        if (queuedSnapshot.current === snapshot) queuedSnapshot.current = ''
        setSaveState('error')
        toast({ title: 'Fields were not saved', description: error instanceof Error ? error.message : 'Try again before sending.', variant: 'destructive' })
        return false
      }
    })
    saveQueue.current = operation
    return operation
  }, [editorFields, envelopeId, payload, replaceFields, toast])

  React.useEffect(() => {
    if (!hydrated || JSON.stringify(editorFields) === lastSaved.current) return
    const timer = window.setTimeout(() => { void saveNow() }, 750)
    return () => window.clearTimeout(timer)
  }, [editorFields, hydrated, saveNow])

  const documentUrlsQuery = useQuery({
    queryKey: ['esign', 'doc-urls', envelopeId, envelope?.documents.map((document) => document.id).join(',')],
    queryFn: async () => {
      const urls: Record<string, string> = {}
      for (const document of envelope!.documents) urls[document.id] = (await apiClient.getEsignDocumentDownload(envelope!.id, document.id)).url
      return urls
    },
    enabled: !!envelope?.documents.length,
    staleTime: 10 * 60 * 1000,
  })

  const signers = envelope?.recipients.filter((recipient) => ['signer', 'witness', 'in_person_signer'].includes(recipient.role)) ?? []
  const issues = collectFieldIssues(editorFields, signers.map((recipient) => ({ id: recipient.id, label: recipient.name || recipient.role_label || recipient.role.replace(/_/g, ' ') })))
  const inspectWidgets = async (documentId: string) => {
    setInspectingWidgets(true)
    try {
      const result = await apiClient.inspectEsignPdfWidgets(envelopeId, documentId)
      if (!(result.widgets ?? []).length) { toast({ title: 'No fillable PDF fields found' }); return }
      const defaultRecipientId = signers.find((recipient) => recipient.role === 'signer')?.id ?? signers[0]?.id ?? ''
      const mappings: Record<string, WidgetMapping> = {}
      for (const widget of result.widgets ?? []) mappings[widget.widget_id] = {
        recipient_id: defaultRecipientId,
        field_type: (widget.suggested_field_type || 'text') as WidgetMapping['field_type'],
        included: widget.supported,
        required: widget.required,
        data_label: widget.name,
      }
      setUnsupportedConfirmed(false)
      setWidgetMappings(mappings)
      setWidgetDialog({ documentId, widgets: result.widgets ?? [] })
    } catch (error) {
      toast({ title: 'Could not inspect PDF fields', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setInspectingWidgets(false)
    }
  }
  const convertWidgets = async () => {
    if (!widgetDialog) return
    setConvertingWidgets(true)
    try {
      if (!await saveNow()) return
      await queryClient.cancelQueries({ queryKey: ['esign', 'envelope', envelopeId] })
      const result = await apiClient.convertEsignPdfWidgets(envelopeId, widgetDialog.documentId, {
        mappings: widgetDialog.widgets.flatMap((widget) => {
          const mapping = widgetMappings[widget.widget_id]
          return mapping?.included && mapping.recipient_id ? [{ widget_id: widget.widget_id, recipient_id: mapping.recipient_id, field_type: mapping.field_type, required: mapping.required, data_label: mapping.data_label }] : []
        }),
        confirm_unsupported_flatten: unsupportedConfirmed,
      })
      const importedFields = toEditorFields(result.fields)
      const importedSnapshot = JSON.stringify(importedFields)
      draftRevision.current = result.draft_revision
      lastSaved.current = importedSnapshot
      queuedSnapshot.current = importedSnapshot
      setEditorFields(importedFields)
      setSaveState('saved')
      queryClient.setQueryData(['esign', 'envelope', envelopeId], result)
      toast({ title: 'PDF form fields imported', description: 'The imported fields are ready to review and edit.' })
      setWidgetDialog(null)
    } catch (error) {
      toast({ title: 'Could not import PDF form fields', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setConvertingWidgets(false)
    }
  }
  const openReview = async () => { if (await saveNow()) setReviewOpen(true) }
  const handleSend = async () => {
    if (issues.length || !await saveNow()) return
    try { await sendEnvelope.mutateAsync(); toast({ title: 'Envelope sent', description: 'Recipients will be notified according to the routing order.' }); router.push(`/dashboard/esign/${envelopeId}`) }
    catch (error) { toast({ title: 'Could not send envelope', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }
  const handleSchedule = async () => {
    if (issues.length || !scheduleAt || !await saveNow()) return
    try {
      await scheduleEnvelope.mutateAsync({ schedule_at: new Date(scheduleAt).toISOString(), schedule_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      toast({ title: 'Envelope scheduled', description: `Delivery is frozen until ${new Date(scheduleAt).toLocaleString()}.` }); router.push(`/dashboard/esign/${envelopeId}`)
    } catch (error) { toast({ title: 'Could not schedule envelope', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }

  return (
    <ComposerShell title={envelope?.title ?? 'Add fields'} stage="fields" saveState={saveState} onClose={() => router.push('/dashboard/esign')} onBack={() => { const query = searchParams.toString(); router.push(`/dashboard/esign/${envelopeId}/prepare${query ? `?${query}` : ''}`) }} primary={<Button onClick={openReview}>Review & send <Send className="ml-1.5 size-4" /></Button>}>
      {!envelope || !hydrated || documentUrlsQuery.isLoading || !documentUrlsQuery.data ? (
        <div className="flex h-full items-center justify-center text-sm text-foreground-muted"><Loader2 className="mr-2 size-4 animate-spin" /> Preparing documents…</div>
      ) : signers.length === 0 ? (
        <div className="mx-auto mt-12 max-w-md rounded-xl border border-success/30 bg-success-soft p-6 text-sm">This envelope has no signature recipients, so no fields are required. Choose Review &amp; send to verify the approval or delivery routing.</div>
      ) : (
        <div className="h-full p-3 sm:p-4">
          <PdfFieldEditor
            className="min-h-full"
            documents={envelope.documents.map((document) => ({ id: document.id, name: document.original_filename, url: documentUrlsQuery.data[document.id], pageCount: document.page_count }))}
            participants={signers.map((recipient) => ({ id: recipient.id, label: `${recipient.name} · ${recipient.email}` }))}
            fields={editorFields}
            onChange={setEditorFields}
            focusFieldId={focusFieldId}
            importingFillableFields={inspectingWidgets}
            onImportFillableFields={(documentId) => void inspectWidgets(documentId)}
            onAnchorSearch={(request) => apiClient.searchEsignAnchors(envelopeId, request)}
          />
        </div>
      )}

      <Dialog open={!!widgetDialog} onOpenChange={(open) => { if (!open) setWidgetDialog(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Import fillable PDF fields</DialogTitle><DialogDescription>Select the existing PDF form fields you want to turn into E-Signature fields, then choose who completes each one. Imported fields keep their positions and appear directly in the field editor.</DialogDescription></DialogHeader>
          <div className="space-y-3">{widgetDialog?.widgets.map((widget) => {
            const mapping = widgetMappings[widget.widget_id]
            if (!widget.supported) return <div key={widget.widget_id} className="rounded border border-warning/40 bg-warning-soft p-3 text-sm"><p className="font-medium">Unsupported widget · {widget.name}</p><p className="text-xs text-foreground-muted">Page {widget.page_number + 1}. This widget cannot be imported as an E-Signature field and will be flattened into the completed PDF after confirmation.</p></div>
            return <div key={widget.widget_id} className="space-y-2 rounded border border-border p-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-[auto_1fr_130px_190px]"><input aria-label={`Import ${widget.name}`} type="checkbox" checked={mapping?.included ?? false} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], included: event.target.checked } }))} /><span title={widget.tooltip ?? widget.name}><span className="font-medium">{widget.name}</span><span className="block text-xs text-foreground-muted">Page {widget.page_number + 1}{widget.default_value ? ` · Default: ${widget.default_value}` : ''}{(widget.choices ?? []).length ? ` · Options: ${(widget.choices ?? []).join(', ')}` : ''}</span></span><select className="rounded border border-border bg-background p-1" value={mapping?.field_type ?? 'text'} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], field_type: event.target.value as WidgetMapping['field_type'] } }))}>{['text', 'signature', 'checkbox', 'radio', 'dropdown', 'number', 'date'].map((type) => <option key={type} value={type}>{type}</option>)}</select><select className="rounded border border-border bg-background p-1" value={mapping?.recipient_id ?? ''} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], recipient_id: event.target.value } }))}><option value="">Choose signing role…</option>{signers.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name || recipient.role_label || recipient.role.replace(/_/g, ' ')} · {recipient.role.replace(/_/g, ' ')}</option>)}</select></div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input aria-label={`${widget.name} data label`} value={mapping?.data_label ?? widget.name} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], data_label: event.target.value } }))} /><label className="flex items-center gap-2"><input type="checkbox" checked={mapping?.required ?? false} onChange={(event) => setWidgetMappings((current) => ({ ...current, [widget.widget_id]: { ...current[widget.widget_id], required: event.target.checked } }))} /> Required</label></div>
            </div>
          })}</div>
          {widgetDialog?.widgets.some((widget) => !widget.supported) && <label className="flex items-start gap-2 rounded border border-warning/40 bg-warning-soft p-3 text-sm"><input className="mt-0.5" type="checkbox" checked={unsupportedConfirmed} onChange={(event) => setUnsupportedConfirmed(event.target.checked)} /><span>I confirm unsupported widgets cannot be imported and may be flattened in the completed document.</span></label>}
          <DialogFooter><Button variant="outline" onClick={() => setWidgetDialog(null)}>Cancel</Button><Button onClick={convertWidgets} disabled={convertingWidgets || (widgetDialog?.widgets.some((widget) => !widget.supported) && !unsupportedConfirmed) || !Object.values(widgetMappings).some((mapping) => mapping.included && mapping.recipient_id)}>{convertingWidgets && <Loader2 className="mr-1.5 size-4 animate-spin" />} Import selected fields</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent className="flex w-[min(92vw,480px)] flex-col sm:max-w-lg">
          <SheetHeader><SheetTitle>Review & send</SheetTitle><SheetDescription>Confirm the envelope and resolve any issues before sending.</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
            <section><h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Documents</h3><ul className="mt-2 space-y-1 text-sm">{envelope?.documents.map((document) => <li key={document.id}>{document.original_filename} · {document.page_count} page{document.page_count === 1 ? '' : 's'}</li>)}</ul></section>
            <section><h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Recipients & routing</h3><ol className="mt-2 space-y-2 text-sm">{envelope?.recipients.map((recipient) => <li key={recipient.id}><span className="font-medium">{recipient.routing_order}. {recipient.name || recipient.role_label || 'Unresolved recipient'}</span><span className="block text-xs text-foreground-muted">{recipient.email || recipient.host_email || 'Identity resolved during routing'} · {recipient.role === 'cc' ? 'Receives a copy' : recipient.role.replace(/_/g, ' ')}</span></li>)}</ol></section>
            <section><h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Message & delivery</h3><p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{envelope?.message || 'No message'}</p><p className="mt-2 text-xs text-foreground-muted">{envelope?.signing_type === 'sequential' ? 'Recipients sign in order' : 'Recipients may sign in any order'}{envelope?.expires_at ? ` · Expires ${new Date(envelope.expires_at).toLocaleDateString()}` : ''}{envelope?.reminder_interval_hours ? ` · Reminders every ${envelope.reminder_interval_hours} hours` : ''}</p></section>
            <section className="rounded-lg border border-border p-3"><div className="flex items-center gap-2">{issues.length ? <AlertCircle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}<h3 className="text-sm font-semibold">{issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} to fix` : 'Ready to send'}</h3></div>{issues.length > 0 && <ul className="mt-2 space-y-1">{issues.map((issue) => <li key={issue.id}><button type="button" className="text-left text-sm text-warning underline-offset-2 hover:underline" onClick={() => { if (issue.fieldId) { setFocusFieldId(issue.fieldId); setReviewOpen(false) } }}>{issue.message}</button></li>)}</ul>}</section>
            <section className="space-y-2 border-t border-border pt-4"><Label htmlFor="review-template-name">Save as template</Label><div className="flex gap-2"><Input id="review-template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" /><Button variant="outline" disabled={!templateName.trim() || saveAsTemplate.isPending} onClick={async () => { try { await saveAsTemplate.mutateAsync({ name: templateName.trim() }); toast({ title: 'Template saved' }); setTemplateName('') } catch (error) { toast({ title: 'Could not save template', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><Save className="mr-1.5 size-4" /> Save</Button></div></section>
            <section className="space-y-2 border-t border-border pt-4"><Label htmlFor="review-schedule">Schedule delivery (optional)</Label><Input id="review-schedule" type="datetime-local" value={scheduleAt} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} onChange={event => setScheduleAt(event.target.value)} /><p className="text-xs text-foreground-muted">Uses {Intl.DateTimeFormat().resolvedOptions().timeZone}. Scheduled envelopes are frozen until unscheduled.</p></section>
          </div>
          <SheetFooter><Button variant="outline" onClick={() => setReviewOpen(false)}>Back to fields</Button>{scheduleAt && <Button variant="outline" onClick={handleSchedule} disabled={issues.length > 0 || scheduleEnvelope.isPending}>Schedule</Button>}<Button onClick={handleSend} disabled={issues.length > 0 || sendEnvelope.isPending}>{sendEnvelope.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />} Send envelope</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </ComposerShell>
  )
}
