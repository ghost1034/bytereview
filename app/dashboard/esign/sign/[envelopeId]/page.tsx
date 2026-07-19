'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowDown,
  CheckCircle2,
  Download,
  FileBadge,
  Loader2,
  Paperclip,
  PenLine,
  Trash2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

import { openPdfFromUrl, participantColor, type PdfDocument } from '@/components/esign/pdf'
import { PdfPageCanvas } from '@/components/esign/PdfPageCanvas'
import { ConsentGate } from '@/components/esign/sign/ConsentGate'
import { formatDateSigned } from '@/components/esign/sign/dateSigned'
import { DeclineDialog } from '@/components/esign/sign/DeclineDialog'
import {
  SignatureAdoptionModal,
  signatureFontFamily,
  type AdoptedSignature,
} from '@/components/esign/sign/SignatureAdoptionModal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import {
  useDeclineEnvelope,
  useRecordConsent,
  useSaveSigningProgress,
  useSigningSession,
  useSubmitSignature,
} from '@/hooks/useEnvelopes'
import { ApiError, apiClient, type EsignFieldResponse } from '@/lib/api'
import type { EsignSignerAttachmentResponse } from '@/lib/api'
import { computeFormulas, incompleteFields as findIncompleteFields, isFieldRequired, resolveVisibility } from '@/lib/esign/fieldLogic'

type CeremonyState = 'signing' | 'submitted' | 'declined'

function SignedDocViewer({
  url,
  name,
  fields,
  fieldValues,
  adopted,
  activeFieldId,
  onFieldClick,
  onTextChange,
  attachments,
  onAttachmentUpload,
  onAttachmentDelete,
}: {
  url: string
  name: string
  fields: EsignFieldResponse[]
  fieldValues: Record<string, string>
  adopted: AdoptedSignature | null
  activeFieldId: string | null
  onFieldClick: (field: EsignFieldResponse) => void
  onTextChange: (fieldId: string, value: string) => void
  attachments: EsignSignerAttachmentResponse[]
  onAttachmentUpload: (fieldId: string, file: File) => void
  onAttachmentDelete: (attachmentId: string) => void
}) {
  const [pdf, setPdf] = React.useState<PdfDocument | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    openPdfFromUrl(url)
      .then((doc) => {
        if (!cancelled) setPdf(doc)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load PDF')
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!pdf) {
    return (
      <div className="flex items-center justify-center py-16 text-foreground-muted">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading {name}…
      </div>
    )
  }

  const color = participantColor(0)

  return (
    <div className="space-y-4">
      {Array.from({ length: pdf.numPages }, (_, pageIndex) => (
        <div key={pageIndex} className="mx-auto w-full max-w-3xl">
          <PdfPageCanvas
            pdf={pdf}
            pageNumber={pageIndex + 1}
            overlay={(size) => (
              <div className="absolute inset-0">
                {fields
                  .filter((f) => f.page_number === pageIndex)
                  .map((field) => {
                    const style: React.CSSProperties = {
                      left: field.pos_x * size.width,
                      top: field.pos_y * size.height,
                      width: field.width * size.width,
                      height: field.height * size.height,
                    }
                    const isActive = field.id === activeFieldId
                    const activeRing = isActive ? 'ring-2 ring-warning ring-offset-1' : ''
                    const isSignature =
                      field.field_type === 'signature' || field.field_type === 'initials'
                    if (isSignature) {
                      const complete = !!adopted
                      const isInitials = field.field_type === 'initials'
                      const imageUrl = isInitials
                        ? adopted?.initialsImageDataUrl
                        : adopted?.signatureType !== 'typed'
                          ? adopted?.imageDataUrl
                          : undefined
                      return (
                        <button
                          key={field.id}
                          id={`esign-field-${field.id}`}
                          type="button"
                          onClick={() => onFieldClick(field)}
                          className={cn(
                            'absolute flex items-center justify-center overflow-hidden rounded-sm border text-xs font-medium transition-colors',
                            complete ? 'border-success bg-white' : 'animate-none border-2',
                            activeRing,
                          )}
                          style={{
                            ...style,
                            ...(complete
                              ? {}
                              : { borderColor: color.border, backgroundColor: color.bg, color: color.text }),
                          }}
                        >
                          {complete ? (
                            imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imageUrl}
                                alt={isInitials ? 'Your initials' : 'Your signature'}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <span
                                className="truncate px-1 text-lg leading-none text-foreground"
                                style={{ fontFamily: signatureFontFamily(adopted?.typedFont) }}
                              >
                                {isInitials ? adopted?.initialsText : adopted?.typedText}
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 truncate px-1">
                              <PenLine className="size-3.5" />
                              {isInitials ? 'Initial' : 'Sign here'}
                            </span>
                          )}
                        </button>
                      )
                    }
                    if (field.field_type === 'date_signed') {
                      // Stamped the moment the signer adopts, in the exact
                      // format the sealed PDF will carry.
                      const stamped = !!adopted
                      return (
                        <div
                          key={field.id}
                          id={`esign-field-${field.id}`}
                          className={cn(
                            'absolute flex items-center overflow-hidden rounded-sm border px-1 text-xs',
                            stamped
                              ? 'border-success bg-surface text-foreground'
                              : 'border-border bg-surface-muted text-foreground-muted',
                          )}
                          style={style}
                          title={
                            stamped
                              ? 'Date signed'
                              : 'Filled automatically when you adopt your signature'
                          }
                        >
                          {formatDateSigned()}
                        </div>
                      )
                    }
                    if (field.field_type === 'checkbox') {
                      const checked = fieldValues[field.id] === 'true'
                      return (
                        <button
                          key={field.id}
                          id={`esign-field-${field.id}`}
                          type="button"
                          onClick={() => onTextChange(field.id, checked ? 'false' : 'true')}
                          className={cn(
                            'absolute flex items-center justify-center rounded-sm border text-sm font-bold',
                            checked ? 'border-success bg-surface text-foreground' : 'border-2',
                            activeRing,
                          )}
                          style={{
                            ...style,
                            ...(checked
                              ? {}
                              : { borderColor: color.border, backgroundColor: color.bg }),
                          }}
                        >
                          {checked ? 'X' : ''}
                        </button>
                      )
                    }
                    if (field.field_type === 'radio') {
                      const selected = fieldValues[field.id] === 'true'
                      return (
                        <button key={field.id} id={`esign-field-${field.id}`} type="button"
                          aria-pressed={selected} aria-label={field.properties?.option_value || field.label || 'Radio option'}
                          onClick={() => {
                            const group = field.properties?.group?.id
                            fields.filter((item) => item.field_type === 'radio' && item.properties?.group?.id === group)
                              .forEach((item) => onTextChange(item.id, item.id === field.id ? 'true' : 'false'))
                          }}
                          className={cn('absolute flex items-center justify-center rounded-full border-2', activeRing)}
                          style={{ ...style, borderColor: color.border, backgroundColor: 'white' }}>
                          {selected && <span className="size-2/3 rounded-full" style={{ backgroundColor: color.border }} />}
                        </button>
                      )
                    }
                    if (field.field_type === 'dropdown') {
                      return <select key={field.id} id={`esign-field-${field.id}`} value={fieldValues[field.id] ?? ''}
                        onChange={(event) => onTextChange(field.id, event.target.value)} className={cn('absolute rounded-sm border-2 bg-surface px-1 text-xs text-foreground', activeRing)} style={{ ...style, borderColor: color.border }}>
                        <option value="">Select…</option>{(field.properties?.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    }
                    if (field.field_type === 'attachment') {
                      const attachment = attachments.find((item) => item.field_id === field.id)
                      return <div key={field.id} id={`esign-field-${field.id}`} className={cn('absolute flex items-center gap-1 overflow-hidden rounded-sm border-2 bg-surface px-1 text-[10px] text-foreground', activeRing)} style={{ ...style, borderColor: color.border }}>
                        {attachment ? <><Paperclip className="size-3 shrink-0" /><span className="truncate">{attachment.original_filename}</span><button type="button" className="ml-auto" onClick={() => onAttachmentDelete(attachment.id)} aria-label="Remove attachment"><Trash2 className="size-3" /></button></>
                          : <label className="flex h-full w-full cursor-pointer items-center justify-center gap-1"><Paperclip className="size-3" /> Attach file<input type="file" className="hidden" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttachmentUpload(field.id, file) }} /></label>}
                      </div>
                    }
                    if (field.field_type === 'formula') {
                      return <div key={field.id} id={`esign-field-${field.id}`} className="absolute flex items-center overflow-hidden rounded-sm border bg-surface px-1 text-xs text-foreground" style={style}>{fieldValues[field.id] ?? ''}</div>
                    }
                    if (field.field_type === 'auto_fill' && field.properties?.auto_source !== 'company') {
                      return <div key={field.id} id={`esign-field-${field.id}`} className="absolute flex items-center overflow-hidden rounded-sm border bg-surface-muted px-1 text-xs text-foreground" style={style}>{fieldValues[field.id] ?? ''}</div>
                    }
                    // text field
                    return (
                      <input
                        key={field.id}
                        id={`esign-field-${field.id}`}
                        type="text"
                        value={fieldValues[field.id] ?? ''}
                        onChange={(e) => onTextChange(field.id, e.target.value)}
                        placeholder={field.label || 'Text'}
                        className={cn(
                          'absolute rounded-sm border-2 bg-surface px-1 text-xs text-foreground focus:outline-none',
                          activeRing,
                        )}
                        style={{ ...style, borderColor: color.border }}
                      />
                    )
                  })}
              </div>
            )}
          />
        </div>
      ))}
    </div>
  )
}

export default function SigningCeremonyPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()

  const sessionQuery = useSigningSession(envelopeId)
  const recordConsent = useRecordConsent(envelopeId!)
  const submitSignature = useSubmitSignature(envelopeId!)
  const declineEnvelope = useDeclineEnvelope(envelopeId!)
  const saveProgress = useSaveSigningProgress(envelopeId!)

  const [ceremonyState, setCeremonyState] = React.useState<CeremonyState>('signing')
  const [adopted, setAdopted] = React.useState<AdoptedSignature | null>(null)
  const [adoptionOpen, setAdoptionOpen] = React.useState(false)
  const [declineOpen, setDeclineOpen] = React.useState(false)
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({})
  const [attachments, setAttachments] = React.useState<EsignSignerAttachmentResponse[]>([])
  const [downloading, setDownloading] = React.useState<'sealed' | 'certificate' | null>(null)
  const [guideStarted, setGuideStarted] = React.useState(false)
  const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null)

  const session = sessionQuery.data

  // Restore Finish Later drafts without clobbering anything typed this visit.
  React.useEffect(() => {
    const drafts: Record<string, string> = {}
    for (const f of session?.fields ?? []) {
      if (f.draft_value) drafts[f.id] = f.draft_value
    }
    if (Object.keys(drafts).length) {
      setFieldValues((prev) => ({ ...drafts, ...prev }))
    }
  }, [session])

  // Save signer entries as they work; Finish Later remains an explicit exit.
  React.useEffect(() => {
    if (!session || session.consent_required || session.recipient_role === 'cc') return
    if (Object.keys(fieldValues).length === 0) return
    const timer = window.setTimeout(() => {
      saveProgress.mutate(
        Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
      )
    }, 1000)
    return () => window.clearTimeout(timer)
    // The mutation object is intentionally excluded; field/session changes drive autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues, session?.consent_required, session?.recipient_role])

  React.useEffect(() => {
    if (!session) return
    setAttachments(session.attachments ?? [])
    const automatic: Record<string, string> = {}
    for (const attachment of session.attachments ?? []) automatic[attachment.field_id] = attachment.id
    for (const field of session.fields ?? []) {
      if (field.field_type !== 'auto_fill') continue
      const source = field.properties?.auto_source
      if (source === 'recipient_name') automatic[field.id] = session.recipient_name
      else if (source === 'recipient_email') automatic[field.id] = session.recipient_email
      else if (source === 'company') automatic[field.id] = session.recipient_company ?? ''
      else if (source === 'date_sent' && session.sent_at) automatic[field.id] = formatDateSigned(new Date(session.sent_at))
    }
    setFieldValues((previous) => ({ ...automatic, ...previous }))
  }, [session])

  // ---- error / terminal states -------------------------------------------
  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-foreground-muted">
        <Loader2 className="mr-2 size-5 animate-spin" /> Preparing your signing session…
      </div>
    )
  }

  if (sessionQuery.isError) {
    const error = sessionQuery.error
    const message =
      error instanceof ApiError
        ? error.message
        : 'This envelope is not available for signing.'
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <ShieldAlert className="size-10 text-warning" />
        <h1 className="text-lg font-semibold">Can&apos;t open signing session</h1>
        <p className="text-sm text-foreground-muted">{message}</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/esign">Go to E-Signature</Link>
        </Button>
      </div>
    )
  }

  if (!session) return null

  if (session.envelope_status === 'completed') {
    const openDownload = async (kind: 'sealed' | 'certificate') => {
      setDownloading(kind)
      try {
        const result =
          kind === 'sealed'
            ? await apiClient.getEsignSealedDownload(session.envelope_id)
            : await apiClient.getEsignCertificateDownload(session.envelope_id)
        window.open(result.url, '_blank', 'noopener')
      } catch (error) {
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setDownloading(null)
      }
    }
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <ShieldCheck className="size-12 text-success" />
        <h1 className="text-xl font-semibold">Completed and digitally sealed</h1>
        <p className="text-sm text-foreground-muted">
          All parties have signed &quot;{session.title}&quot;. The sealed PDF carries an embedded
          digital signature — any modification after completion will invalidate it.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => openDownload('sealed')} disabled={downloading === 'sealed'}>
            {downloading === 'sealed' ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-4" />
            )}
            Signed PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => openDownload('certificate')}
            disabled={downloading === 'certificate'}
          >
            {downloading === 'certificate' ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <FileBadge className="mr-1.5 size-4" />
            )}
            Certificate
          </Button>
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard/esign">Back to E-Signature</Link>
        </Button>
      </div>
    )
  }

  if (ceremonyState === 'submitted') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <h1 className="text-xl font-semibold">You&apos;re done signing</h1>
        <p className="text-sm text-foreground-muted">
          Your signature on &quot;{session.title}&quot; has been recorded with your identity
          evidence. When every signer has finished, the document is digitally sealed and you&apos;ll
          receive the completed copy by email.
        </p>
        <Button asChild>
          <Link href="/dashboard/esign">Back to E-Signature</Link>
        </Button>
      </div>
    )
  }

  if (ceremonyState === 'declined') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <ShieldAlert className="size-12 text-warning" />
        <h1 className="text-xl font-semibold">Envelope declined</h1>
        <p className="text-sm text-foreground-muted">
          The sender has been notified of your decision and reason.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard/esign">Back to E-Signature</Link>
        </Button>
      </div>
    )
  }

  // ---- copy recipient (read-only) ----------------------------------------
  if (session.recipient_role === 'cc') {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-40 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{session.title}</h1>
            <p className="text-xs text-foreground-muted">
              From {session.sender_email} · You&apos;re receiving a copy — no action is needed
            </p>
          </div>
          <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground-muted">
            Copy
          </span>
        </div>
        {session.message && (
          <p className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted">
            {session.message}
          </p>
        )}
        <div className="space-y-8 rounded-lg bg-surface-muted p-3 sm:p-5">
          {(session.documents ?? []).map((doc) => (
            <div key={doc.id} className="space-y-2">
              {(session.documents ?? []).length > 1 && (
                <h2 className="text-sm font-medium text-foreground-muted">
                  {doc.original_filename}
                </h2>
              )}
              <SignedDocViewer
                url={doc.download_url}
                name={doc.original_filename}
                fields={[]}
                fieldValues={{}}
                adopted={null}
                activeFieldId={null}
                onFieldClick={() => {}}
                onTextChange={() => {}}
                attachments={[]}
                onAttachmentUpload={() => {}}
                onAttachmentDelete={() => {}}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- signing ------------------------------------------------------------
  // Reading order (document, page, top-to-bottom, left-to-right) so guided
  // navigation walks the envelope the way a person reads it.
  const documentOrder = new Map((session.documents ?? []).map((d, i) => [d.id, i]))
  const contextValues = Object.fromEntries((session.context_fields ?? []).map((field) => [field.id, field.value ?? '']))
  const logicFields = [...(session.fields ?? []), ...(session.context_fields ?? [])]
  const baseValues = { ...contextValues, ...fieldValues }
  const displayValues = { ...baseValues, ...computeFormulas(logicFields, baseValues) }
  const visibility = resolveVisibility(logicFields, displayValues)
  const myFields = [...(session.fields ?? [])].filter((field) => visibility[field.id]).sort(
    (a, b) =>
      (documentOrder.get(a.document_id) ?? 0) - (documentOrder.get(b.document_id) ?? 0) ||
      a.page_number - b.page_number ||
      a.pos_y - b.pos_y ||
      a.pos_x - b.pos_x,
  )
  const incompleteFields = findIncompleteFields(logicFields, displayValues, !!adopted)
    .filter((field) => myFields.some((candidate) => candidate.id === field.id)) as EsignFieldResponse[]
  const countedRadioGroups = new Set<string>()
  const totalRequired = myFields.filter((field) => {
    if (['signature', 'initials', 'date_signed'].includes(field.field_type)) return true
    if (field.field_type === 'formula') return false
    if (field.field_type === 'radio') {
      const group = field.properties?.group?.id ?? field.id
      if (countedRadioGroups.has(group)) return false
      countedRadioGroups.add(group)
      return myFields.filter((member) => member.field_type === 'radio' && member.properties?.group?.id === group)
        .some((member) => isFieldRequired(member, logicFields, displayValues, visibility))
    }
    return isFieldRequired(field, logicFields, displayValues, visibility)
  }).length
  const completedCount = Math.max(0, totalRequired - incompleteFields.length)
  const canFinish = !!adopted && incompleteFields.length === 0

  const goToNextField = () => {
    setGuideStarted(true)
    const next = incompleteFields[0]
    if (!next) return
    setActiveFieldId(next.id)
    const el = document.getElementById(`esign-field-${next.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (next.field_type === 'text' || next.field_type === 'dropdown' || next.field_type === 'auto_fill') {
      ;(el as HTMLInputElement | null)?.focus({ preventScroll: true })
    }
  }

  const handleFieldClick = () => {
    setAdoptionOpen(true)
  }

  const handleAttachmentUpload = async (fieldId: string, file: File) => {
    try {
      const uploaded = await apiClient.uploadEsignSignerAttachment(session.envelope_id, fieldId, file)
      setAttachments((previous) => [...previous.filter((item) => item.field_id !== fieldId), uploaded])
      setFieldValues((previous) => ({ ...previous, [fieldId]: uploaded.id }))
    } catch (error) {
      toast({ title: 'Attachment upload failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    }
  }

  const handleAttachmentDelete = async (attachmentId: string) => {
    try {
      const item = attachments.find((attachment) => attachment.id === attachmentId)
      await apiClient.deleteEsignSignerAttachment(session.envelope_id, attachmentId)
      setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId))
      if (item) setFieldValues((previous) => ({ ...previous, [item.field_id]: '' }))
    } catch (error) {
      toast({ title: 'Could not remove attachment', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    }
  }

  const handleFinish = async () => {
    if (!adopted) return
    try {
      const result = await submitSignature.mutateAsync({
        signature: {
          signature_type: adopted.signatureType,
          image_data_url: adopted.imageDataUrl,
          typed_text: adopted.typedText,
          typed_font: adopted.typedFont,
          initials_text: adopted.initialsText,
          initials_image_data_url: adopted.initialsImageDataUrl,
        },
        field_values: Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
      })
      setCeremonyState('submitted')
      if (result.sealing_enqueued) {
        toast({
          title: 'All signatures collected',
          description: 'The document is being digitally sealed now.',
        })
      }
    } catch (error) {
      toast({
        title: 'Failed to submit signature',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const handleFinishLater = async () => {
    try {
      await saveProgress.mutateAsync(
        Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
      )
      toast({
        title: 'Progress saved',
        description: 'You can resume signing anytime from your E-Signature inbox.',
      })
      router.push('/dashboard/esign')
    } catch (error) {
      toast({
        title: 'Failed to save progress',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const handleDecline = async (reason: string) => {
    try {
      await declineEnvelope.mutateAsync(reason)
      setDeclineOpen(false)
      setCeremonyState('declined')
    } catch (error) {
      toast({
        title: 'Failed to decline',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-dvh space-y-4 bg-surface-muted/50 pb-24 sm:pb-4">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{session.title}</h1>
          <p className="text-xs text-foreground-muted">
            From {session.sender_email} · {completedCount} of {totalRequired} required fields complete
            {session.expires_at && (
              <> · Expires {new Date(session.expires_at).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Button variant="outline" onClick={() => setDeclineOpen(true)}>
            Decline
          </Button>
          {!session.consent_required && (
            <Button
              variant="outline"
              onClick={handleFinishLater}
              disabled={saveProgress.isPending}
            >
              {saveProgress.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Finish Later
            </Button>
          )}
          {!adopted ? (
            <Button onClick={() => setAdoptionOpen(true)}>
              <PenLine className="mr-1.5 size-4" /> Adopt signature
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={!canFinish || submitSignature.isPending}>
              {submitSignature.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 size-4" />
              )}
              Finish signing
            </Button>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 flex min-h-16 items-center gap-2 border-t border-border bg-surface/95 px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <Button variant="outline" className="min-h-11 flex-1" onClick={handleFinishLater} disabled={saveProgress.isPending}>Finish later</Button>
        {incompleteFields.length > 0 ? (
          <Button className="min-h-11 flex-1" onClick={goToNextField}>{guideStarted ? 'Next' : 'Start'} <ArrowDown className="ml-1.5 size-4" /></Button>
        ) : (
          <Button className="min-h-11 flex-1" onClick={handleFinish} disabled={!canFinish || submitSignature.isPending}>Finish</Button>
        )}
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" onClick={() => setDeclineOpen(true)} aria-label="Decline envelope"><ShieldAlert className="size-5" /></Button>
      </div>

      {session.message && (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted">
          {session.message}
        </p>
      )}

      {/* Floating guided-navigation button (DocuSign-style Start/Next). */}
      {!session.consent_required && (
        <div className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 sm:block">
          {incompleteFields.length > 0 ? (
            <Button size="sm" className="shadow-lg" onClick={goToNextField}>
              {guideStarted ? 'Next' : 'Start'}
              <ArrowDown className="ml-1.5 size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="shadow-lg"
              onClick={handleFinish}
              disabled={!canFinish || submitSignature.isPending}
            >
              Finish
            </Button>
          )}
        </div>
      )}

      {/* Documents (blurred + inert until consent) */}
      <div
        className={cn(
          'mx-auto max-w-5xl space-y-8 p-3 sm:p-5',
          session.consent_required && 'pointer-events-none select-none blur-sm',
        )}
        aria-hidden={session.consent_required || undefined}
      >
        {session.documents.map((doc) => (
          <div key={doc.id} className="space-y-2">
            {session.documents.length > 1 && (
              <h2 className="text-sm font-medium text-foreground-muted">{doc.original_filename}</h2>
            )}
            <SignedDocViewer
              url={doc.download_url}
              name={doc.original_filename}
              fields={myFields.filter((f) => f.document_id === doc.id)}
              fieldValues={displayValues}
              adopted={adopted}
              activeFieldId={activeFieldId}
              onFieldClick={handleFieldClick}
              onTextChange={(fieldId, value) =>
                setFieldValues((prev) => ({ ...prev, [fieldId]: value }))
              }
              attachments={attachments}
              onAttachmentUpload={handleAttachmentUpload}
              onAttachmentDelete={handleAttachmentDelete}
            />
          </div>
        ))}
      </div>

      {session.consent_required && (
        <ConsentGate
          disclosureText={session.consent_disclosure_text}
          senderEmail={session.sender_email}
          agreeing={recordConsent.isPending}
          onAgree={async () => {
            try {
              await recordConsent.mutateAsync()
            } catch (error) {
              toast({
                title: 'Failed to record consent',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              })
            }
          }}
          onDecline={() => setDeclineOpen(true)}
        />
      )}

      <SignatureAdoptionModal
        open={adoptionOpen}
        onOpenChange={setAdoptionOpen}
        defaultName={user?.displayName ?? ''}
        onAdopt={setAdopted}
      />

      <DeclineDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        onDecline={handleDecline}
        declining={declineEnvelope.isPending}
      />
    </div>
  )
}
