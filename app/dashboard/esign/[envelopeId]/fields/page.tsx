'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
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
import { apiClient, type EsignFieldInput } from '@/lib/api'
import { collectFieldIssues } from '@/lib/esign/composerValidation'

export default function EnvelopeFieldsPage() {
  const { envelopeId } = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const lastSaved = React.useRef('')

  React.useEffect(() => {
    if (!envelope || hydrated) return
    const initial = envelope.fields.map((field) => ({
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
    setEditorFields(initial)
    lastSaved.current = JSON.stringify(initial)
    setHydrated(true)
  }, [envelope, hydrated])

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
    setSaveState('saving')
    try {
      await replaceFields.mutateAsync(payload(editorFields))
      lastSaved.current = snapshot
      setSaveState('saved')
      return true
    } catch (error) {
      setSaveState('error')
      toast({ title: 'Fields were not saved', description: error instanceof Error ? error.message : 'Try again before sending.', variant: 'destructive' })
      return false
    }
  }, [editorFields, payload, replaceFields, toast])

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
  const issues = collectFieldIssues(editorFields, signers.map((recipient) => recipient.id))
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
      {!envelope || documentUrlsQuery.isLoading || !documentUrlsQuery.data ? (
        <div className="flex h-full items-center justify-center text-sm text-foreground-muted"><Loader2 className="mr-2 size-4 animate-spin" /> Preparing documents…</div>
      ) : signers.length === 0 ? (
        <div className="mx-auto mt-12 max-w-md rounded-xl border border-warning/30 bg-warning-soft p-6 text-sm">Return to Prepare and add at least one signer before placing fields.</div>
      ) : (
        <div className="h-full p-3 sm:p-4">
          <PdfFieldEditor
            className="min-h-full"
            documents={envelope.documents.map((document) => ({ id: document.id, name: document.original_filename, url: documentUrlsQuery.data[document.id], pageCount: document.page_count }))}
            participants={signers.map((recipient) => ({ id: recipient.id, label: `${recipient.name} · ${recipient.email}` }))}
            fields={editorFields}
            onChange={setEditorFields}
            focusFieldId={focusFieldId}
            onAnchorSearch={(request) => apiClient.searchEsignAnchors(envelopeId, request)}
          />
        </div>
      )}

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent className="flex w-[min(92vw,480px)] flex-col sm:max-w-lg">
          <SheetHeader><SheetTitle>Review & send</SheetTitle><SheetDescription>Confirm the envelope and resolve any issues before sending.</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
            <section><h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Documents</h3><ul className="mt-2 space-y-1 text-sm">{envelope?.documents.map((document) => <li key={document.id}>{document.original_filename} · {document.page_count} page{document.page_count === 1 ? '' : 's'}</li>)}</ul></section>
            <section><h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Recipients & routing</h3><ol className="mt-2 space-y-2 text-sm">{envelope?.recipients.map((recipient) => <li key={recipient.id}><span className="font-medium">{recipient.routing_order}. {recipient.name}</span><span className="block text-xs text-foreground-muted">{recipient.email} · {recipient.role === 'cc' ? 'Receives a copy' : 'Signer'}</span></li>)}</ol></section>
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
