'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Download, Loader2, PenLine, ShieldAlert, ShieldCheck } from 'lucide-react'

import { ConsentGate } from '@/components/esign/sign/ConsentGate'
import { SignatureAdoptionModal, type AdoptedSignature } from '@/components/esign/sign/SignatureAdoptionModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import type { components } from '@/lib/api-types'
import { computeFormulas, incompleteFields as findIncompleteFields, resolveVisibility } from '@/lib/esign/fieldLogic'

type Session = components['schemas']['EsignSigningSessionResponse']
type Attachment = components['schemas']['EsignSignerAttachmentResponse']
type SubmitRequest = components['schemas']['EsignGuestSubmitRequest']

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail ?? `Guest request failed (${response.status})`)
  }
  return response.json()
}

export default function GuestSigningPage() {
  const search = useSearchParams()
  const invitation = search.get('token')
  const existingSession = search.get('session')
  const powerFormVerification = search.get('powerform_token')
  const [sessionId, setSessionId] = React.useState<string | null>(existingSession)
  const [csrf, setCsrf] = React.useState<string | null>(
    existingSession && typeof window !== 'undefined'
      ? sessionStorage.getItem(`esign_guest_csrf_${existingSession}`)
      : null,
  )
  const [session, setSession] = React.useState<Session | null>(null)
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({})
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [adopted, setAdopted] = React.useState<AdoptedSignature | null>(null)
  const [adoptionOpen, setAdoptionOpen] = React.useState(false)
  const [occupation, setOccupation] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [witnessName, setWitnessName] = React.useState('')
  const [witnessEmail, setWitnessEmail] = React.useState('')
  const [witnessLink, setWitnessLink] = React.useState<string | null>(null)
  const [replacementName, setReplacementName] = React.useState('')
  const [replacementEmail, setReplacementEmail] = React.useState('')
  const [replacementReason, setReplacementReason] = React.useState('')
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<'signed' | 'declined' | 'reassigned' | 'completed' | null>(null)

  const guestRequest = React.useCallback(async <T,>(path: string, options: RequestInit = {}) => {
    if (!sessionId) throw new Error('Guest session is unavailable')
    const headers = new Headers(options.headers)
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    if (options.method && options.method !== 'GET') {
      if (!csrf) throw new Error('Guest session security token is unavailable; reopen the email link')
      headers.set('X-CSRF-Token', csrf)
    }
    return parseResponse<T>(await fetch(`/api/esign/guest/sessions/${sessionId}${path}`, {
      ...options, credentials: 'include', headers,
    }))
  }, [csrf, sessionId])

  const load = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      let token = invitation
      if (powerFormVerification) {
        const verified = await parseResponse<{ invitation_token: string }>(await fetch(
          '/api/esign/public/powerforms/verification/exchange',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: powerFormVerification }) },
        ))
        token = verified.invitation_token
      }
      let currentId = existingSession
      let currentCsrf = existingSession ? sessionStorage.getItem(`esign_guest_csrf_${existingSession}`) : null
      if (token) {
        const exchanged = await parseResponse<{ session_id: string; csrf_token: string }>(await fetch(
          '/api/esign/guest/exchange',
          { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation_token: token }) },
        ))
        currentId = exchanged.session_id
        currentCsrf = exchanged.csrf_token
        sessionStorage.setItem(`esign_guest_csrf_${currentId}`, currentCsrf)
        window.history.replaceState({}, '', `/esign/guest?session=${encodeURIComponent(currentId)}`)
        setSessionId(currentId)
        setCsrf(currentCsrf)
      }
      if (!currentId) throw new Error('Open the secure link from your recipient email')
      setSessionId(currentId)
      setCsrf(currentCsrf)
      const current = await parseResponse<Session>(await fetch(
        `/api/esign/guest/sessions/${currentId}`, { credentials: 'include' },
      ))
      setSession(current)
      setAttachments(current.attachments ?? [])
      const initial: Record<string, string> = {}
      for (const attachment of current.attachments ?? []) initial[attachment.field_id] = attachment.id
      for (const field of current.fields ?? []) {
        if (field.draft_value) initial[field.id] = field.draft_value
        if (field.properties?.sender_prefill != null) initial[field.id] = field.properties.sender_prefill
        if (field.field_type === 'first_name') initial[field.id] = current.recipient_name.split(/\s+/)[0] ?? ''
        if (field.field_type === 'last_name') { const names = current.recipient_name.split(/\s+/); initial[field.id] = names[names.length - 1] ?? '' }
        if (field.field_type === 'full_name') initial[field.id] = current.recipient_name
        if (field.field_type === 'email') initial[field.id] = current.recipient_email
      }
      setFieldValues(initial)
      if (current.access_purpose === 'completed_copy') setDone('completed')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Guest invitation could not be opened')
    } finally {
      setBusy(false)
    }
  }, [existingSession, invitation, powerFormVerification])

  React.useEffect(() => { void load() }, [load])

  React.useEffect(() => {
    if (!sessionId || !csrf || !session || session.consent_required || !Object.keys(fieldValues).length) return
    if (!['signer', 'witness', 'in_person_signer'].includes(session.recipient_role)) return
    const timer = window.setTimeout(() => {
      void guestRequest('/progress', {
        method: 'PUT',
        body: JSON.stringify({
          expected_routing_version: session.routing_version,
          field_values: Object.entries(fieldValues).map(([field_id, value]) => ({ field_id, value })),
        }),
      }).catch(() => undefined)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [csrf, fieldValues, guestRequest, session, sessionId])

  const consent = async () => {
    if (!session) return
    setBusy(true)
    try {
      await guestRequest('/consent', {
        method: 'POST', body: JSON.stringify({ expected_routing_version: session.routing_version }),
      })
      setSession({ ...session, consent_required: false })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Consent failed') }
    finally { setBusy(false) }
  }

  const submit = async () => {
    if (!session || !adopted) return
    setBusy(true)
    try {
      const payload: SubmitRequest = {
        expected_routing_version: session.routing_version,
        signature: {
          signature_type: adopted.signatureType,
          image_data_url: adopted.imageDataUrl,
          typed_text: adopted.typedText,
          typed_font: adopted.typedFont,
          initials_text: adopted.initialsText,
          initials_image_data_url: adopted.initialsImageDataUrl,
        },
        field_values: (session.fields ?? []).map((field) =>
          ['signature', 'initials', 'stamp'].includes(field.field_type)
            ? { field_id: field.id, completed: fieldValues[field.id] === 'true' }
            : { field_id: field.id, value: fieldValues[field.id] },
        ),
        occupation: session.recipient_role === 'witness' ? occupation : undefined,
        address: session.recipient_role === 'witness' ? address : undefined,
      }
      await guestRequest('/submit', { method: 'POST', body: JSON.stringify(payload) })
      if (sessionId) sessionStorage.removeItem(`esign_guest_csrf_${sessionId}`)
      setDone('signed')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Signature submission failed') }
    finally { setBusy(false) }
  }

  const decline = async () => {
    if (!session) return
    const reason = window.prompt('Reason for declining (required)')?.trim()
    if (!reason) return
    setBusy(true)
    try {
      await guestRequest('/decline', {
        method: 'POST', body: JSON.stringify({ reason, expected_routing_version: session.routing_version }),
      })
      setDone('declined')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Decline failed') }
    finally { setBusy(false) }
  }

  const configureWitness = async () => {
    if (!session) return
    setBusy(true); setError(null)
    try {
      const result = await guestRequest<{ guest_url: string }>('/witness', {
        method: 'PUT', body: JSON.stringify({ name: witnessName.trim(), email: witnessEmail.trim() || null, expected_routing_version: session.routing_version }),
      })
      setWitnessLink(result.guest_url)
      const refreshed = await guestRequest<Session>('', { method: 'GET' })
      setSession(refreshed)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Witness could not be configured') }
    finally { setBusy(false) }
  }

  const reassign = async () => {
    if (!session) return
    setBusy(true); setError(null)
    try {
      await guestRequest('/reassign', {
        method: 'POST', body: JSON.stringify({ replacement_name: replacementName.trim(), replacement_email: replacementEmail.trim(), reason: replacementReason.trim(), expected_routing_version: session.routing_version }),
      })
      setDone('reassigned')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Reassignment failed') }
    finally { setBusy(false) }
  }

  const uploadAttachment = async (fieldId: string, file: File) => {
    const form = new FormData()
    form.append('field_id', fieldId)
    form.append('file', file)
    const uploaded = await guestRequest<Attachment>('/attachments', { method: 'POST', body: form })
    setAttachments((items) => [...items.filter((item) => item.field_id !== fieldId), uploaded])
    setFieldValues((values) => ({ ...values, [fieldId]: uploaded.id }))
  }

  const deleteAttachment = async (attachmentId: string) => {
    const item = attachments.find((attachment) => attachment.id === attachmentId)
    await guestRequest(`/attachments/${attachmentId}`, { method: 'DELETE' })
    setAttachments((items) => items.filter((attachment) => attachment.id !== attachmentId))
    if (item) setFieldValues((values) => ({ ...values, [item.field_id]: '' }))
  }

  if (busy && !session) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-foreground-muted"><Loader2 className="mr-2 size-5 animate-spin" /> Opening secure ceremony…</div>
  if (error && !session) return <div className="mx-auto max-w-md space-y-4 py-20 text-center"><ShieldAlert className="mx-auto size-10 text-warning" /><h1 className="text-lg font-semibold">Secure ceremony unavailable</h1><p className="text-sm text-destructive">{error}</p><Button asChild variant="outline"><Link href="/">Return home</Link></Button></div>
  if (!session) return null

  if (done === 'completed') return <CompletedCopy session={session} sessionId={sessionId!} />
  if (done) return <div className="mx-auto max-w-md space-y-4 py-20 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="text-xl font-semibold">{done === 'signed' ? 'Signature recorded' : done === 'reassigned' ? 'Signing step reassigned' : 'Envelope declined'}</h1><p className="text-sm text-foreground-muted">{done === 'signed' ? 'You are finished. A secure link to the completed documents will be emailed after all parties finish.' : 'The sender has been notified.'}</p></div>

  if (!['signer', 'witness', 'in_person_signer'].includes(session.recipient_role)) {
    return <RoleCeremony session={session} guestRequest={guestRequest} onDone={() => setDone('signed')} onDecline={decline} error={error} />
  }

  const contextValues = Object.fromEntries((session.context_fields ?? []).map((field) => [field.id, field.value ?? '']))
  const logicFields = [...(session.fields ?? []), ...(session.context_fields ?? [])]
  const baseValues = { ...contextValues, ...fieldValues }
  const displayValues = { ...baseValues, ...computeFormulas(logicFields, baseValues) }
  const visibility = resolveVisibility(logicFields, displayValues)
  const fields = (session.fields ?? []).filter((field) => visibility[field.id])
  const incomplete = findIncompleteFields(logicFields, displayValues, !!adopted)
    .filter((field) => fields.some((candidate) => candidate.id === field.id))
  const witnessReady = session.recipient_role !== 'witness' || (!!occupation.trim() && !!address.trim())

  return <div className="min-h-dvh space-y-4 bg-surface-muted/50 pb-24">
    <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
      <div><h1 className="font-semibold">{session.title}</h1><p className="text-xs text-foreground-muted">From {session.sender_email} · no CPAAutomation account required</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => void decline()}>Decline</Button><Button onClick={() => adopted ? void submit() : setAdoptionOpen(true)} disabled={busy || (!!adopted && (incomplete.length > 0 || !witnessReady))}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}{adopted ? 'Finish signing' : <><PenLine className="mr-2 size-4" />Adopt signature</>}</Button></div>
    </header>
    {error && <p className="mx-auto max-w-5xl rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {session.message && <p className="mx-auto max-w-5xl rounded border border-border bg-surface p-4 text-sm">{session.message}</p>}
    {(session.available_actions ?? []).includes('configure_witness') && <section className="mx-auto max-w-5xl space-y-3 rounded border border-border bg-surface p-4"><h2 className="font-medium">Confirm your witness</h2><div className="grid gap-2 sm:grid-cols-2"><Input placeholder="Witness full name" value={witnessName} onChange={(event) => setWitnessName(event.target.value)} /><Input type="email" placeholder="Witness email (optional)" value={witnessEmail} onChange={(event) => setWitnessEmail(event.target.value)} /></div><Button variant="outline" disabled={busy || !witnessName.trim()} onClick={() => void configureWitness()}>Confirm witness</Button>{witnessLink && <p className="break-all rounded bg-surface-muted p-2 text-xs">Secure witness link: {witnessLink}</p>}</section>}
    {(session.available_actions ?? []).includes('reassign') && <section className="mx-auto grid max-w-5xl gap-2 rounded border border-border bg-surface p-4 sm:grid-cols-3"><Input placeholder="Replacement name" value={replacementName} onChange={(event) => setReplacementName(event.target.value)} /><Input type="email" placeholder="Replacement email" value={replacementEmail} onChange={(event) => setReplacementEmail(event.target.value)} /><Input placeholder="Reason" value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} /><Button variant="outline" disabled={busy || !replacementName.trim() || !replacementEmail.trim() || !replacementReason.trim()} onClick={() => void reassign()}>Reassign this step</Button></section>}
    {session.recipient_role === 'witness' && <section className="mx-auto grid max-w-5xl gap-3 rounded border border-border bg-surface p-4 sm:grid-cols-2"><div><Label htmlFor="occupation">Occupation</Label><Input id="occupation" value={occupation} onChange={(event) => setOccupation(event.target.value)} /></div><div><Label htmlFor="address">Address</Label><Textarea id="address" value={address} onChange={(event) => setAddress(event.target.value)} /></div></section>}
    <main className="mx-auto max-w-5xl space-y-8 p-3">
      {session.documents.map((document) => <GuestDocument key={document.id} document={document} fields={fields.filter((field) => field.document_id === document.id)} values={displayValues} adopted={adopted} onAdopt={() => setAdoptionOpen(true)} onChange={(fieldId, value) => setFieldValues((values) => ({ ...values, [fieldId]: value }))} attachments={attachments} onUpload={(fieldId, file) => void uploadAttachment(fieldId, file).catch((cause) => setError(cause instanceof Error ? cause.message : 'Upload failed'))} onDelete={(id) => void deleteAttachment(id).catch((cause) => setError(cause instanceof Error ? cause.message : 'Delete failed'))} />)}
    </main>
    {session.consent_required && <ConsentGate disclosureText={session.consent_disclosure_text} senderEmail={session.sender_email} agreeing={busy} onAgree={() => void consent()} onDecline={() => void decline()} />}
    <SignatureAdoptionModal open={adoptionOpen} onOpenChange={setAdoptionOpen} defaultName={session.recipient_name} onAdopt={(artifact) => { setAdopted(artifact); setFieldValues((values) => ({ ...values, ...Object.fromEntries(fields.filter((field) => ['signature', 'initials', 'stamp'].includes(field.field_type)).map((field) => [field.id, 'true'])) })) }} />
  </div>
}

function CompletedCopy({ session, sessionId }: { session: Session; sessionId: string }) {
  const download = async (kind: 'sealed' | 'certificate') => {
    const result = await parseResponse<{ url: string }>(await fetch(`/api/esign/guest/sessions/${sessionId}/completed/${kind}`, { credentials: 'include' }))
    window.location.assign(result.url)
  }
  return <div className="mx-auto max-w-lg space-y-5 py-20 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="text-xl font-semibold">Completed: {session.title}</h1><p className="text-sm text-foreground-muted">This read-only link expires 30 days after completion.</p><div className="flex justify-center gap-2">{session.has_sealed_document && <Button onClick={() => void download('sealed')}><Download className="mr-2 size-4" />Completed PDF</Button>}{session.has_certificate && <Button variant="outline" onClick={() => void download('certificate')}><Download className="mr-2 size-4" />Certificate</Button>}</div></div>
}

function RoleCeremony({ session, guestRequest, onDone, onDecline, error }: { session: Session; guestRequest: <T>(path: string, options?: RequestInit) => Promise<T>; onDone: () => void; onDecline: () => Promise<void>; error: string | null }) {
  const [busy, setBusy] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const [routingVersion, setRoutingVersion] = React.useState(session.routing_version)
  const [managed, setManaged] = React.useState<Record<string, { name: string; email: string }>>(
    Object.fromEntries((session.managed_recipients ?? []).map((recipient) => [recipient.id, { name: recipient.name ?? '', email: recipient.email ?? '' }])),
  )
  const saveManaged = async () => {
    setBusy(true); setLocalError(null)
    try {
      const result = await guestRequest<{ routing_version: number }>('/managed-recipients', {
        method: 'PATCH', body: JSON.stringify({
          expected_routing_version: routingVersion,
          recipients: Object.entries(managed).map(([recipient_id, value]) => ({ recipient_id, ...value })),
        }),
      })
      setRoutingVersion(result.routing_version)
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'Recipient update failed') }
    finally { setBusy(false) }
  }
  const act = async () => {
    setBusy(true); setLocalError(null)
    try {
      if (session.recipient_role === 'approver') await guestRequest('/approve', { method: 'POST', body: JSON.stringify({ expected_routing_version: routingVersion }) })
      else if (['agent', 'editor'].includes(session.recipient_role)) await guestRequest('/manager-complete', { method: 'POST', body: JSON.stringify({ expected_routing_version: routingVersion }) })
      onDone()
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'Action failed') }
    finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-4xl space-y-4 py-8"><div className="rounded border border-border bg-surface p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h1 className="font-semibold">{session.title}</h1></div><p className="mt-2 text-sm text-foreground-muted">Secure {session.recipient_role.replace(/_/g, ' ')} step for {session.recipient_name}.</p></div>{(error || localError) && <p className="text-sm text-destructive">{error || localError}</p>}{['agent', 'editor'].includes(session.recipient_role) && !!(session.managed_recipients ?? []).length && <section className="space-y-3 rounded border border-border bg-surface p-5"><h2 className="font-medium">Managed recipients</h2>{(session.managed_recipients ?? []).map((recipient) => <div key={recipient.id} className="grid gap-2 sm:grid-cols-2"><Input aria-label={`${recipient.role_label ?? 'Recipient'} name`} value={managed[recipient.id]?.name ?? ''} placeholder={recipient.role_label ?? 'Recipient name'} onChange={(event) => setManaged((values) => ({ ...values, [recipient.id]: { ...(values[recipient.id] ?? { email: '' }), name: event.target.value } }))} /><Input type="email" aria-label={`${recipient.role_label ?? 'Recipient'} email`} value={managed[recipient.id]?.email ?? ''} placeholder="recipient@example.com" onChange={(event) => setManaged((values) => ({ ...values, [recipient.id]: { ...(values[recipient.id] ?? { name: '' }), email: event.target.value } }))} /></div>)}<Button variant="outline" disabled={busy} onClick={() => void saveManaged()}>Save recipients</Button></section>}<div className="flex gap-2">{session.recipient_role === 'approver' && <Button disabled={busy} onClick={() => void act()}>Approve</Button>}{['agent', 'editor'].includes(session.recipient_role) && <Button disabled={busy} onClick={() => void act()}>Complete step</Button>}{(session.available_actions ?? []).includes('decline') && <Button variant="outline" onClick={() => void onDecline()}>Decline</Button>}</div><section className="space-y-2 rounded border border-border bg-surface p-5"><h2 className="font-medium">Documents</h2>{session.documents.map((document) => <Button key={document.id} asChild variant="outline"><a href={document.download_url} target="_blank" rel="noreferrer">Review {document.original_filename}</a></Button>)}</section></div>
}

function GuestDocument({ document, fields, values, adopted, onAdopt, onChange, attachments, onUpload, onDelete }: { document: Session['documents'][number]; fields: Session['fields']; values: Record<string, string>; adopted: AdoptedSignature | null; onAdopt: () => void; onChange: (fieldId: string, value: string) => void; attachments: Attachment[]; onUpload: (fieldId: string, file: File) => void; onDelete: (attachmentId: string) => void }) {
  return <section className="space-y-4 rounded-lg border border-border bg-surface p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-medium">{document.original_filename}</h2><p className="text-xs text-foreground-muted">{document.page_count} page{document.page_count === 1 ? '' : 's'}</p></div><Button asChild variant="outline"><a href={document.download_url} target="_blank" rel="noreferrer">Review PDF</a></Button></div><div className="grid gap-4 sm:grid-cols-2">{(fields ?? []).map((field) => {
    const label = field.label || field.field_type.replace(/_/g, ' ')
    const attachment = attachments.find((item) => item.field_id === field.id)
    if (['signature', 'initials', 'stamp'].includes(field.field_type)) return <div key={field.id} className="space-y-2"><Label>{label}{field.required ? ' *' : ''}</Label><Button type="button" variant="outline" className="w-full" onClick={() => adopted ? onChange(field.id, values[field.id] === 'true' ? 'false' : 'true') : onAdopt()}>{values[field.id] === 'true' ? (adopted?.typedText || 'Signature applied') : 'Apply signature'}</Button></div>
    if (field.field_type === 'date_signed' || field.field_type === 'formula') return <div key={field.id}><Label>{label}</Label><Input readOnly value={values[field.id] || (field.field_type === 'date_signed' ? 'Filled when signed' : 'Calculated at completion')} /></div>
    if (field.field_type === 'checkbox' || field.field_type === 'radio') return <label key={field.id} className="flex items-center gap-2 rounded border border-border p-3 text-sm"><Checkbox checked={values[field.id] === 'true'} onCheckedChange={(checked) => onChange(field.id, checked ? 'true' : 'false')} />{label}{field.required ? ' *' : ''}</label>
    if (field.field_type === 'dropdown') return <div key={field.id}><Label htmlFor={field.id}>{label}{field.required ? ' *' : ''}</Label><select id={field.id} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={values[field.id] || ''} onChange={(event) => onChange(field.id, event.target.value)}><option value="">Select…</option>{(field.properties?.options ?? []).map((option) => <option key={String(option.value)} value={String(option.value)}>{String(option.label ?? option.value)}</option>)}</select></div>
    if (field.field_type === 'attachment') return <div key={field.id} className="space-y-2"><Label>{label}{field.required ? ' *' : ''}</Label>{attachment ? <div className="flex items-center gap-2 text-sm"><span className="truncate">{attachment.original_filename}</span><Button size="sm" variant="ghost" onClick={() => onDelete(attachment.id)}>Remove</Button></div> : <Input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(field.id, file) }} />}</div>
    return <div key={field.id}><Label htmlFor={field.id}>{label}{field.required ? ' *' : ''}</Label><Input id={field.id} type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'} value={values[field.id] || ''} onChange={(event) => onChange(field.id, event.target.value)} readOnly={['first_name', 'last_name', 'full_name', 'email'].includes(field.field_type)} /></div>
  })}</div></section>
}
