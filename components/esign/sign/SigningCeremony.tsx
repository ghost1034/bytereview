'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  CheckCircle2,
  Download,
  FileBadge,
  Loader2,
  PenLine,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

import { ConsentGate } from '@/components/esign/sign/ConsentGate'
import { DeclineDialog } from '@/components/esign/sign/DeclineDialog'
import {
  SignatureAdoptionModal,
  type AdoptedSignature,
} from '@/components/esign/sign/SignatureAdoptionModal'
import { SigningDocumentViewer } from '@/components/esign/sign/SigningDocumentViewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  EsignFieldResponse,
  EsignInPersonStartRequest,
  EsignManagedRecipientsRequest,
  EsignReassignRequest,
  EsignSignerAttachmentResponse,
  EsignSigningSessionResponse,
  EsignSubmitRequest,
  EsignSubmitResponse,
  EsignWitnessRequest,
} from '@/lib/api'
import { adoptedToMarks, marksToAdopted, mergeCeremonyState } from '@/lib/esign/ceremony'
import {
  computeFormulas,
  incompleteFields as findIncompleteFields,
  isFieldRequired,
  resolveVisibility,
  validationErrors,
} from '@/lib/esign/fieldLogic'
import { cn } from '@/lib/utils'

type CeremonyState = 'signing' | 'submitted' | 'declined' | 'reassigned' | 'saved'
type DownloadKind = 'sealed' | 'certificate'

export interface SigningProgressInput {
  fieldValues: { field_id: string; value?: string | null }[]
  expectedRoutingVersion: number
  marks?: EsignSubmitRequest['marks']
}

/**
 * Access-specific operations for a signing ceremony. Authenticated and guest
 * routes intentionally implement this interface differently; the ceremony UI
 * and state machine remain identical.
 */
export interface SigningCeremonyTransport {
  access: 'authenticated' | 'guest'
  recordConsent: (expectedRoutingVersion: number) => Promise<unknown>
  saveProgress: (input: SigningProgressInput) => Promise<unknown>
  submit: (payload: EsignSubmitRequest) => Promise<EsignSubmitResponse>
  decline: (reason: string, expectedRoutingVersion: number) => Promise<unknown>
  uploadAttachment: (fieldId: string, file: File) => Promise<EsignSignerAttachmentResponse>
  deleteAttachment: (attachmentId: string) => Promise<unknown>
  reassign: (payload: EsignReassignRequest) => Promise<unknown>
  approve?: (expectedRoutingVersion: number) => Promise<unknown>
  completeManagerStep?: (expectedRoutingVersion: number) => Promise<unknown>
  updateManagedRecipients?: (payload: EsignManagedRecipientsRequest) => Promise<unknown>
  configureWitness?: (payload: EsignWitnessRequest) => Promise<{ guest_url: string }>
  startInPerson?: (payload: EsignInPersonStartRequest) => Promise<{ guest_url: string }>
  downloadCompleted?: (kind: DownloadKind) => Promise<void>
  refresh?: () => Promise<EsignSigningSessionResponse>
  afterFinishLater?: () => void
}

interface SigningCeremonyProps {
  initialSession: EsignSigningSessionResponse
  transport: SigningCeremonyTransport
  displayName?: string | null
  exitHref?: string
  stickyTopClassName?: string
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function ReadOnlyDocuments({ session }: { session: EsignSigningSessionResponse }) {
  return (
    <div className="space-y-8 rounded-lg bg-surface-muted p-3 sm:p-5">
      {session.documents.map((document) => (
        <div key={document.id} className="space-y-2">
          {session.documents.length > 1 && (
            <h2 className="text-sm font-medium text-foreground-muted">{document.original_filename}</h2>
          )}
          <SigningDocumentViewer
            url={document.download_url}
            name={document.original_filename}
            fields={[]}
            fieldValues={{}}
            adopted={null}
            activeFieldId={null}
            onFieldClick={() => undefined}
            onTextChange={() => undefined}
            attachments={[]}
            onAttachmentUpload={() => undefined}
            onAttachmentDelete={() => undefined}
          />
        </div>
      ))}
    </div>
  )
}

function ExitButton({ href, variant = 'default' }: { href?: string; variant?: 'default' | 'outline' | 'ghost' }) {
  if (!href) return null
  return (
    <Button asChild variant={variant}>
      <Link href={href}>Back to E-Signature</Link>
    </Button>
  )
}

export function SigningCeremony({
  initialSession,
  transport,
  displayName,
  exitHref,
  stickyTopClassName = 'top-0',
}: SigningCeremonyProps) {
  const [session, setSession] = React.useState(initialSession)
  const [ceremonyState, setCeremonyState] = React.useState<CeremonyState>('signing')
  const [adopted, setAdopted] = React.useState<AdoptedSignature | null>(null)
  const [adoptionOpen, setAdoptionOpen] = React.useState(false)
  const [declineOpen, setDeclineOpen] = React.useState(false)
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({})
  const [attachments, setAttachments] = React.useState<EsignSignerAttachmentResponse[]>([])
  const [guideStarted, setGuideStarted] = React.useState(false)
  const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null)
  const [pendingApplyFieldId, setPendingApplyFieldId] = React.useState<string | null>(null)
  const [busyAction, setBusyAction] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState<DownloadKind | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [handoffName, setHandoffName] = React.useState('')
  const [guestLink, setGuestLink] = React.useState<string | null>(null)
  const [witnessName, setWitnessName] = React.useState('')
  const [witnessEmail, setWitnessEmail] = React.useState('')
  const [witnessMode, setWitnessMode] = React.useState<'remote' | 'in_person'>('remote')
  const [witnessOccupation, setWitnessOccupation] = React.useState('')
  const [witnessAddress, setWitnessAddress] = React.useState('')
  const [replacementName, setReplacementName] = React.useState('')
  const [replacementEmail, setReplacementEmail] = React.useState('')
  const [reassignmentReason, setReassignmentReason] = React.useState('')
  const [managedValues, setManagedValues] = React.useState<Record<string, { name: string; email: string }>>({})

  React.useEffect(() => setSession(initialSession), [initialSession])

  React.useEffect(() => {
    setAttachments(session.attachments ?? [])
    setFieldValues((previous) => mergeCeremonyState(previous, session))
    setAdopted((previous) => previous ?? marksToAdopted(session.draft_marks))
  }, [session])

  React.useEffect(() => {
    setManagedValues(Object.fromEntries((session.managed_recipients ?? []).map((recipient) => [
      recipient.id,
      { name: recipient.name ?? '', email: recipient.email ?? '' },
    ])))
  }, [session.managed_recipients])

  // Autosave is common ceremony behavior. Guest CSRF/session handling remains
  // encapsulated by its transport implementation.
  React.useEffect(() => {
    if (session.consent_required || session.recipient_role === 'cc') return
    if (!['signer', 'witness', 'in_person_signer'].includes(session.recipient_role)) return
    if (Object.keys(fieldValues).length === 0) return
    const timer = window.setTimeout(() => {
      void transport.saveProgress({
        fieldValues: Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
        expectedRoutingVersion: session.routing_version,
        marks: adoptedToMarks(adopted),
      }).catch(() => undefined)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [adopted, fieldValues, session.consent_required, session.recipient_role, session.routing_version, transport])

  const refresh = async () => {
    if (!transport.refresh) return
    setSession(await transport.refresh())
  }

  const run = async (action: string, task: () => Promise<void>, fallback: string) => {
    setBusyAction(action)
    setError(null)
    try {
      await task()
    } catch (cause) {
      setError(errorMessage(cause, fallback))
    } finally {
      setBusyAction(null)
    }
  }

  const handleDecline = async (reason: string) => {
    await run('decline', async () => {
      await transport.decline(reason, session.routing_version)
      setDeclineOpen(false)
      setCeremonyState('declined')
    }, 'The envelope could not be declined')
  }

  const performReassignment = async () => {
    await run('reassign', async () => {
      await transport.reassign({
        replacement_name: replacementName.trim(),
        replacement_email: replacementEmail.trim(),
        reason: reassignmentReason.trim(),
        expected_routing_version: session.routing_version,
      })
      setCeremonyState('reassigned')
    }, 'This signing step could not be reassigned')
  }

  const openDownload = async (kind: DownloadKind) => {
    if (!transport.downloadCompleted) return
    setDownloading(kind)
    setError(null)
    try {
      await transport.downloadCompleted(kind)
    } catch (cause) {
      setError(errorMessage(cause, 'The completed document could not be downloaded'))
    } finally {
      setDownloading(null)
    }
  }

  if (session.access_purpose === 'completed_copy') {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-20 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h1 className="text-xl font-semibold">Completed: {session.title}</h1>
        <p className="text-sm text-foreground-muted">This read-only link expires 30 days after completion.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-center gap-2">
          {session.has_sealed_document && (
            <Button onClick={() => void openDownload('sealed')} disabled={!!downloading}>
              {downloading === 'sealed' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Completed PDF
            </Button>
          )}
          {session.has_certificate && (
            <Button variant="outline" onClick={() => void openDownload('certificate')} disabled={!!downloading}>
              {downloading === 'certificate' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Certificate
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (session.envelope_status === 'completed') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <ShieldCheck className="size-12 text-success" />
        <h1 className="text-xl font-semibold">Completed and digitally sealed</h1>
        <p className="text-sm text-foreground-muted">
          All parties have signed &quot;{session.title}&quot;. The sealed PDF carries an embedded
          digital signature — any modification after completion will invalidate it.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {transport.downloadCompleted && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void openDownload('sealed')} disabled={!!downloading}>
              {downloading === 'sealed' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
              Signed PDF
            </Button>
            <Button variant="outline" onClick={() => void openDownload('certificate')} disabled={!!downloading}>
              {downloading === 'certificate' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileBadge className="mr-1.5 size-4" />}
              Certificate
            </Button>
          </div>
        )}
        <ExitButton href={exitHref} variant="ghost" />
      </div>
    )
  }

  if (ceremonyState !== 'signing') {
    const declined = ceremonyState === 'declined'
    const title = ceremonyState === 'submitted'
      ? (transport.access === 'guest' ? 'Signature recorded' : "You're done signing")
      : ceremonyState === 'reassigned'
        ? 'Signing step reassigned'
        : ceremonyState === 'saved'
          ? 'Progress saved'
          : 'Envelope declined'
    const description = ceremonyState === 'submitted'
      ? 'Your signature has been recorded. A secure link to the completed documents will be emailed after all parties finish.'
      : ceremonyState === 'saved'
        ? 'You can safely close this tab and return through your secure email link.'
        : 'The sender has been notified.'
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        {declined ? <ShieldAlert className="size-12 text-warning" /> : <CheckCircle2 className="size-12 text-success" />}
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-foreground-muted">{description}</p>
        {ceremonyState === 'saved' && <Button variant="outline" onClick={() => setCeremonyState('signing')}>Continue signing</Button>}
        {ceremonyState !== 'saved' && <ExitButton href={exitHref} variant={declined ? 'outline' : 'default'} />}
      </div>
    )
  }

  const guestInPersonSigner = transport.access === 'guest' && session.recipient_role === 'in_person_signer'
  const isSigner = ['signer', 'witness'].includes(session.recipient_role) || guestInPersonSigner

  if (!isSigner && session.recipient_role !== 'cc') {
    const roleLabel = session.recipient_role.replace(/_/g, ' ')
    const act = async (action: 'approve' | 'manager' | 'handoff') => {
      await run(action, async () => {
        if (action === 'approve') {
          if (!transport.approve) throw new Error('Approval is unavailable for this access method')
          await transport.approve(session.routing_version)
          setCeremonyState('submitted')
        } else if (action === 'manager') {
          if (!transport.completeManagerStep) throw new Error('Manager completion is unavailable for this access method')
          await transport.completeManagerStep(session.routing_version)
          setCeremonyState('submitted')
        } else {
          if (!transport.startInPerson) throw new Error('In-person handoff is unavailable for this access method')
          const invitation = await transport.startInPerson({
            signer_name: handoffName.trim(),
            expected_routing_version: session.routing_version,
          })
          setGuestLink(invitation.guest_url)
        }
      }, 'The action could not be completed')
    }

    const saveManaged = async () => {
      await run('managed', async () => {
        if (!transport.updateManagedRecipients) throw new Error('Recipient updates are unavailable for this access method')
        await transport.updateManagedRecipients({
          expected_routing_version: session.routing_version,
          recipients: Object.entries(managedValues).map(([recipient_id, value]) => ({ recipient_id, ...value })),
        })
        await refresh()
      }, 'Recipient identities could not be updated')
    }

    return (
      <div className="space-y-5">
        <div className={cn('sticky z-40 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 px-4 py-3 backdrop-blur', stickyTopClassName)}>
          <div>
            <h1 className="text-base font-semibold">{session.title}</h1>
            <p className="text-xs capitalize text-foreground-muted">{roleLabel} ceremony · routing version {session.routing_version}</p>
          </div>
          <div className="flex gap-2">
            {(session.available_actions ?? []).includes('decline') && <Button variant="outline" onClick={() => setDeclineOpen(true)}>Decline</Button>}
            {(session.available_actions ?? []).includes('approve') && <Button disabled={!!busyAction} onClick={() => void act('approve')}>Approve</Button>}
            {(session.available_actions ?? []).includes('manager_complete') && <Button disabled={!!busyAction} onClick={() => void act('manager')}>Complete step</Button>}
          </div>
        </div>
        {error && <p className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {session.private_message && <p className="rounded-lg border border-primary/20 bg-primary-soft p-4 text-sm"><span className="font-medium">Private message:</span> {session.private_message}</p>}
        {(session.available_actions ?? []).includes('reassign') && (
          <ReassignmentFields
            busy={!!busyAction}
            name={replacementName}
            email={replacementEmail}
            reason={reassignmentReason}
            onNameChange={setReplacementName}
            onEmailChange={setReplacementEmail}
            onReasonChange={setReassignmentReason}
            onSubmit={() => void performReassignment()}
          />
        )}
        {session.recipient_role === 'certified_delivery' && (
          <p className="rounded-lg border border-success/30 bg-success-soft p-4 text-sm">Delivery was recorded when this secure document session opened. No signature is required.</p>
        )}
        {['agent', 'editor'].includes(session.recipient_role) && (
          <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <div><h2 className="font-semibold">Managed recipients</h2><p className="text-sm text-foreground-muted">Resolve assigned placeholders. Editors may update any outstanding recipient.</p></div>
            {(session.managed_recipients ?? []).map((recipient) => (
              <div key={recipient.id} className="grid gap-2 sm:grid-cols-2">
                <Input aria-label={`${recipient.role_label ?? 'Recipient'} name`} placeholder={recipient.role_label ?? 'Recipient name'} value={managedValues[recipient.id]?.name ?? ''} onChange={(event) => setManagedValues((current) => ({ ...current, [recipient.id]: { ...(current[recipient.id] ?? { email: '' }), name: event.target.value } }))} />
                <Input type="email" aria-label={`${recipient.role_label ?? 'Recipient'} email`} placeholder="recipient@example.com" value={managedValues[recipient.id]?.email ?? ''} onChange={(event) => setManagedValues((current) => ({ ...current, [recipient.id]: { ...(current[recipient.id] ?? { name: '' }), email: event.target.value } }))} />
              </div>
            ))}
            <Button variant="outline" disabled={!!busyAction || !(session.managed_recipients ?? []).length} onClick={() => void saveManaged()}>Save identities</Button>
          </section>
        )}
        {session.recipient_role === 'in_person_signer' && transport.startInPerson && (
          <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h2 className="font-semibold">Hosted handoff</h2>
            <p className="text-sm text-foreground-muted">Confirm the person signing on this device, then hand them the screen for consent and signing.</p>
            <Input placeholder="In-person signer name" value={handoffName} onChange={(event) => setHandoffName(event.target.value)} />
            <Button disabled={!!busyAction || !handoffName.trim()} onClick={() => void act('handoff')}>Start secure handoff</Button>
            {guestLink && <Button asChild variant="outline"><Link href={guestLink}>Continue to guest ceremony</Link></Button>}
          </section>
        )}
        <ReadOnlyDocuments session={session} />
        <DeclineDialog open={declineOpen} onOpenChange={setDeclineOpen} declining={busyAction === 'decline'} onDecline={handleDecline} />
      </div>
    )
  }

  if (session.recipient_role === 'cc') {
    return (
      <div className="space-y-4">
        <div className={cn('sticky z-40 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 px-4 py-3 backdrop-blur', stickyTopClassName)}>
          <div className="min-w-0"><h1 className="truncate text-base font-semibold">{session.title}</h1><p className="text-xs text-foreground-muted">From {session.sender_email} · You&apos;re receiving a copy — no action is needed</p></div>
          <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground-muted">Copy</span>
        </div>
        {session.message && <p className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted">{session.message}</p>}
        <ReadOnlyDocuments session={session} />
      </div>
    )
  }

  const documentOrder = new Map(session.documents.map((document, index) => [document.id, index]))
  const contextValues = Object.fromEntries((session.context_fields ?? []).map((field) => [field.id, field.value ?? '']))
  const logicFields = [...(session.fields ?? []), ...(session.context_fields ?? [])]
  const baseValues = { ...contextValues, ...fieldValues }
  const displayValues = { ...baseValues, ...computeFormulas(logicFields, baseValues) }
  const visibility = resolveVisibility(logicFields, displayValues)
  const fields = [...(session.fields ?? [])].filter((field) => visibility[field.id]).sort(
    (left, right) =>
      (documentOrder.get(left.document_id) ?? 0) - (documentOrder.get(right.document_id) ?? 0) ||
      left.page_number - right.page_number || left.pos_y - right.pos_y || left.pos_x - right.pos_x,
  )
  const incomplete = findIncompleteFields(logicFields, displayValues, !!adopted)
    .filter((field) => fields.some((candidate) => candidate.id === field.id)) as EsignFieldResponse[]
  const allFieldErrors = validationErrors(logicFields, displayValues, !!adopted)
  const fieldErrors = Object.fromEntries(Object.entries(allFieldErrors).filter(([id]) => fields.some((field) => field.id === id)))
  const countedRadioGroups = new Set<string>()
  const totalRequired = fields.filter((field) => {
    if (['signature', 'initials', 'stamp'].includes(field.field_type)) return isFieldRequired(field, logicFields, displayValues, visibility)
    if (field.field_type === 'date_signed' || field.field_type === 'formula') return false
    if (field.field_type === 'radio') {
      const group = field.properties?.group?.id ?? field.id
      if (countedRadioGroups.has(group)) return false
      countedRadioGroups.add(group)
      return fields.filter((member) => member.field_type === 'radio' && member.properties?.group?.id === group)
        .some((member) => isFieldRequired(member, logicFields, displayValues, visibility))
    }
    return isFieldRequired(field, logicFields, displayValues, visibility)
  }).length
  const completedCount = Math.max(0, totalRequired - incomplete.length)
  const witnessReady = session.recipient_role !== 'witness' || (!!witnessOccupation.trim() && !!witnessAddress.trim())
  const hasAppliedMarks = fields.some((field) => ['signature', 'initials', 'stamp'].includes(field.field_type) && fieldValues[field.id] === 'true')
  const hasSignatureLikeFields = fields.some((field) => ['signature', 'initials', 'stamp'].includes(field.field_type))
  const canFinish = (!hasAppliedMarks || !!adopted) && incomplete.length === 0 && witnessReady

  const goToNextField = () => {
    setGuideStarted(true)
    const next = incomplete[0]
    if (!next) return
    setActiveFieldId(next.id)
    const element = document.getElementById(`esign-field-${next.id}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    ;(element as HTMLElement | null)?.focus({ preventScroll: true })
  }

  const handleFieldClick = (field: EsignFieldResponse) => {
    const hasMatchingMark = !!adopted && (
      field.field_type === 'stamp' ? !!adopted.stampImageDataUrl
        : field.field_type === 'initials' ? !!(adopted.initialsText || adopted.initialsImageDataUrl)
          : adopted.signatureType === 'typed' ? !!adopted.typedText : !!adopted.imageDataUrl
    )
    if (hasMatchingMark) {
      setFieldValues((current) => ({ ...current, [field.id]: current[field.id] === 'true' ? 'false' : 'true' }))
      return
    }
    setPendingApplyFieldId(field.id)
    setAdoptionOpen(true)
  }

  const handleValueChange = (fieldId: string, value: string) => {
    const source = fields.find((field) => field.id === fieldId)
    setFieldValues((current) => {
      const next = { ...current, [fieldId]: value }
      const label = source?.properties?.data_label
      if (label && source.properties?.shared_value) {
        fields.filter((field) => field.properties?.shared_value && field.properties?.data_label === label)
          .forEach((field) => { next[field.id] = value })
      }
      return next
    })
  }

  const handleFinish = async () => {
    await run('submit', async () => {
      const submittedFields: NonNullable<EsignSubmitRequest['field_values']> = []
      for (const field of fields) {
        if (['signature', 'initials', 'stamp'].includes(field.field_type)) submittedFields.push({ field_id: field.id, completed: fieldValues[field.id] === 'true' })
        else if (Object.prototype.hasOwnProperty.call(fieldValues, field.id)) submittedFields.push({ field_id: field.id, value: fieldValues[field.id] })
      }
      await transport.submit({
        expected_routing_version: session.routing_version,
        marks: adoptedToMarks(adopted),
        field_values: submittedFields,
        occupation: session.recipient_role === 'witness' ? witnessOccupation.trim() : undefined,
        address: session.recipient_role === 'witness' ? witnessAddress.trim() : undefined,
      })
      setCeremonyState('submitted')
    }, 'The signature could not be submitted')
  }

  const handleFinishLater = async () => {
    await run('save', async () => {
      await transport.saveProgress({
        fieldValues: Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
        expectedRoutingVersion: session.routing_version,
        marks: adoptedToMarks(adopted),
      })
      if (transport.afterFinishLater) transport.afterFinishLater()
      else setCeremonyState('saved')
    }, 'Progress could not be saved')
  }

  const configureWitness = async () => {
    await run('witness', async () => {
      if (!transport.configureWitness) throw new Error('Witness configuration is unavailable for this access method')
      const invitation = await transport.configureWitness({
        name: witnessName.trim(),
        email: witnessMode === 'remote' ? witnessEmail.trim() : null,
        mode: witnessMode,
        expected_routing_version: session.routing_version,
      })
      setGuestLink(witnessMode === 'in_person' ? invitation.guest_url : null)
      await refresh()
    }, 'The witness could not be configured')
  }

  const uploadAttachment = async (fieldId: string, file: File) => {
    setError(null)
    try {
      const uploaded = await transport.uploadAttachment(fieldId, file)
      setAttachments((current) => [...current.filter((item) => item.field_id !== fieldId), uploaded])
      setFieldValues((current) => ({ ...current, [fieldId]: uploaded.id }))
    } catch (cause) {
      setError(errorMessage(cause, 'The attachment could not be uploaded'))
    }
  }

  const deleteAttachment = async (attachmentId: string) => {
    setError(null)
    try {
      const item = attachments.find((attachment) => attachment.id === attachmentId)
      await transport.deleteAttachment(attachmentId)
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))
      if (item) setFieldValues((current) => ({ ...current, [item.field_id]: '' }))
    } catch (cause) {
      setError(errorMessage(cause, 'The attachment could not be removed'))
    }
  }

  return (
    <div className="min-h-dvh space-y-4 bg-surface-muted/50 pb-24 sm:pb-4">
      <header className={cn('sticky z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6', stickyTopClassName)}>
        <div className="min-w-0"><h1 className="truncate text-base font-semibold">{session.title}</h1><p className="text-xs text-foreground-muted">From {session.sender_email} · {completedCount} of {totalRequired} required fields complete{session.expires_at && <> · Expires {new Date(session.expires_at).toLocaleDateString()}</>}</p></div>
        <div className="hidden items-center gap-2 sm:flex">
          <Button variant="outline" onClick={() => setDeclineOpen(true)}>Decline</Button>
          {!session.consent_required && <Button variant="outline" onClick={() => void handleFinishLater()} disabled={!!busyAction}>{busyAction === 'save' && <Loader2 className="mr-1.5 size-4 animate-spin" />}Finish Later</Button>}
          {!adopted && hasSignatureLikeFields
            ? <Button onClick={() => setAdoptionOpen(true)}><PenLine className="mr-1.5 size-4" /> Adopt signature</Button>
            : <Button onClick={() => void handleFinish()} disabled={!!busyAction || !canFinish}>{busyAction === 'submit' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-1.5 size-4" />}Finish signing</Button>}
        </div>
      </header>
      <div className="fixed inset-x-0 bottom-0 z-50 flex min-h-16 items-center gap-2 border-t border-border bg-surface/95 px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <Button variant="outline" className="min-h-11 flex-1" onClick={() => void handleFinishLater()} disabled={!!busyAction}>Finish later</Button>
        {incomplete.length > 0
          ? <Button className="min-h-11 flex-1" onClick={goToNextField}>{guideStarted ? 'Next' : 'Start'} <ArrowDown className="ml-1.5 size-4" /></Button>
          : <Button className="min-h-11 flex-1" onClick={() => void handleFinish()} disabled={!!busyAction || !canFinish}>Finish</Button>}
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" onClick={() => setDeclineOpen(true)} aria-label="Decline envelope"><ShieldAlert className="size-5" /></Button>
      </div>
      {error && <p className="mx-auto max-w-5xl rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {Object.keys(fieldErrors).length > 0 && guideStarted && <div role="alert" className="mx-auto max-w-5xl rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Complete or correct these fields:</p><ul className="mt-1 list-disc pl-5">{Object.entries(fieldErrors).map(([id, message]) => <li key={id}><button type="button" className="underline" onClick={() => { setActiveFieldId(id); document.getElementById(`esign-field-${id}`)?.focus() }}>{message}</button></li>)}</ul></div>}
      {session.message && <p className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground-muted">{session.message}</p>}
      {session.private_message && <p className="rounded-lg border border-primary/20 bg-primary-soft p-4 text-sm"><span className="font-medium">Private message:</span> {session.private_message}</p>}
      {(session.available_actions ?? []).includes('configure_witness') && transport.configureWitness && (
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div><h2 className="font-semibold">Confirm your witness</h2><p className="text-sm text-foreground-muted">The witness signs after you through an audited, secure invitation.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={witnessMode} onValueChange={(value) => setWitnessMode(value as 'remote' | 'in_person')}><SelectTrigger aria-label="Witness mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="remote">Remote witness</SelectItem><SelectItem value="in_person">In person on this device</SelectItem></SelectContent></Select>
            <Input placeholder="Witness full name" value={witnessName} onChange={(event) => setWitnessName(event.target.value)} />
            {witnessMode === 'remote' && <Input className="sm:col-span-2" type="email" placeholder="Witness email (required)" value={witnessEmail} onChange={(event) => setWitnessEmail(event.target.value)} />}
          </div>
          <Button variant="outline" disabled={!!busyAction || !witnessName.trim() || (witnessMode === 'remote' && !witnessEmail.trim())} onClick={() => void configureWitness()}>Confirm witness</Button>
          {guestLink && witnessMode === 'in_person' && <p className="break-all rounded bg-surface-muted p-2 text-xs text-foreground-muted">Audited in-person handoff: {guestLink}</p>}
        </section>
      )}
      {(session.available_actions ?? []).includes('reassign') && (
        <ReassignmentFields busy={!!busyAction} name={replacementName} email={replacementEmail} reason={reassignmentReason} onNameChange={setReplacementName} onEmailChange={setReplacementEmail} onReasonChange={setReassignmentReason} onSubmit={() => void performReassignment()} />
      )}
      {session.recipient_role === 'witness' && <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"><div><Label htmlFor="witness-occupation">Occupation</Label><Input id="witness-occupation" value={witnessOccupation} onChange={(event) => setWitnessOccupation(event.target.value)} /></div><div><Label htmlFor="witness-address">Address</Label><Textarea id="witness-address" value={witnessAddress} onChange={(event) => setWitnessAddress(event.target.value)} /></div></section>}
      {!session.consent_required && <div className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 sm:block">{incomplete.length > 0 ? <Button size="sm" className="shadow-lg" onClick={goToNextField}>{guideStarted ? 'Next' : 'Start'}<ArrowDown className="ml-1.5 size-3.5" /></Button> : <Button size="sm" className="shadow-lg" onClick={() => void handleFinish()} disabled={!!busyAction || !canFinish}>Finish</Button>}</div>}
      <main className={cn('mx-auto max-w-5xl space-y-8 p-3 sm:p-5', session.consent_required && 'pointer-events-none select-none blur-sm')} aria-hidden={session.consent_required || undefined}>
        {session.documents.map((document) => <div key={document.id} className="space-y-2">{session.documents.length > 1 && <h2 className="text-sm font-medium text-foreground-muted">{document.original_filename}</h2>}<SigningDocumentViewer url={document.download_url} name={document.original_filename} fields={fields.filter((field) => field.document_id === document.id)} fieldValues={displayValues} adopted={adopted} activeFieldId={activeFieldId} onFieldClick={handleFieldClick} onTextChange={handleValueChange} attachments={attachments} onAttachmentUpload={(fieldId, file) => void uploadAttachment(fieldId, file)} onAttachmentDelete={(id) => void deleteAttachment(id)} dateFormat={session.date_format} fieldErrors={fieldErrors} /></div>)}
      </main>
      {session.consent_required && <ConsentGate disclosureText={session.consent_disclosure_text} senderEmail={session.sender_email} agreeing={busyAction === 'consent'} onAgree={() => void run('consent', async () => { await transport.recordConsent(session.routing_version); setSession((current) => ({ ...current, consent_required: false })); await refresh() }, 'Consent could not be recorded')} onDecline={() => setDeclineOpen(true)} />}
      <SignatureAdoptionModal open={adoptionOpen} onOpenChange={setAdoptionOpen} defaultName={displayName || session.recipient_name} requireStamp={!!pendingApplyFieldId && fields.find((field) => field.id === pendingApplyFieldId)?.field_type === 'stamp'} onAdopt={(artifact) => { const targetType = fields.find((field) => field.id === pendingApplyFieldId)?.field_type; setAdopted((previous) => targetType === 'stamp' && previous ? { ...previous, stampType: artifact.stampType, stampImageDataUrl: artifact.stampImageDataUrl } : { ...artifact, stampType: artifact.stampType ?? previous?.stampType, stampImageDataUrl: artifact.stampImageDataUrl ?? previous?.stampImageDataUrl }); if (pendingApplyFieldId) setFieldValues((current) => ({ ...current, [pendingApplyFieldId]: 'true' })); setPendingApplyFieldId(null) }} />
      <DeclineDialog open={declineOpen} onOpenChange={setDeclineOpen} onDecline={handleDecline} declining={busyAction === 'decline'} />
    </div>
  )
}

interface ReassignmentFieldsProps {
  busy: boolean
  name: string
  email: string
  reason: string
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onReasonChange: (value: string) => void
  onSubmit: () => void
}

function ReassignmentFields({ busy, name, email, reason, onNameChange, onEmailChange, onReasonChange, onSubmit }: ReassignmentFieldsProps) {
  return (
    <section className="grid gap-2 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3">
      <Input placeholder="Replacement name" value={name} onChange={(event) => onNameChange(event.target.value)} />
      <Input type="email" placeholder="Replacement email" value={email} onChange={(event) => onEmailChange(event.target.value)} />
      <Input placeholder="Reason (required)" value={reason} onChange={(event) => onReasonChange(event.target.value)} />
      <Button variant="outline" disabled={busy || !name.trim() || !email.trim() || !reason.trim()} onClick={onSubmit}>Reassign this step</Button>
    </section>
  )
}
