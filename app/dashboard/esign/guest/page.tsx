'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { components } from '@/lib/api-types'

type GuestSession = components['schemas']['EsignGuestSessionResponse']

async function guestRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/esign/guest${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail ?? `Guest request failed (${response.status})`)
  }
  return response.json()
}

export default function GuestSigningPage() {
  const search = useSearchParams()
  const invitation = search.get('token')
  const powerFormVerification = search.get('powerform_token')
  const [csrf, setCsrf] = React.useState<string | null>(null)
  const [session, setSession] = React.useState<GuestSession | null>(null)
  const [typedName, setTypedName] = React.useState('')
  const [occupation, setOccupation] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const load = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      let csrfToken = sessionStorage.getItem('esign_guest_csrf')
      let invitationToken = invitation
      if (powerFormVerification) {
        const response = await fetch('/api/esign/public/powerforms/verification/exchange', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: powerFormVerification }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.detail ?? 'PowerForm verification failed')
        invitationToken = body.invitation_token
      }
      if (invitationToken) {
        const exchanged = await guestRequest<{ csrf_token: string }>('/exchange', {
          method: 'POST', body: JSON.stringify({ invitation_token: invitationToken }),
        })
        csrfToken = exchanged.csrf_token
        sessionStorage.setItem('esign_guest_csrf', csrfToken)
        window.history.replaceState({}, '', '/esign/guest')
      }
      const current = await guestRequest<GuestSession>('/session')
      setCsrf(csrfToken)
      setSession(current)
      setTypedName(current.recipient_name ?? '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Guest invitation could not be opened')
    } finally { setBusy(false) }
  }, [invitation, powerFormVerification])

  React.useEffect(() => { void load() }, [load])

  const consent = async () => {
    if (!session || !csrf) return
    setBusy(true)
    try {
      await guestRequest('/consent', {
        method: 'POST', headers: { 'X-CSRF-Token': csrf },
        body: JSON.stringify({ expected_routing_version: session.routing_version }),
      })
      setSession({ ...session, consent_required: false })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Consent failed') }
    finally { setBusy(false) }
  }

  const submit = async () => {
    if (!session || !csrf) return
    setBusy(true)
    try {
      await guestRequest('/submit', {
        method: 'POST', headers: { 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          expected_routing_version: session.routing_version,
          signature: { signature_type: 'typed', typed_text: typedName, typed_font: 'dancing-script' },
          field_values: (session.fields ?? []).filter((field) => ['signature', 'initials', 'stamp'].includes(field.field_type)).map((field) => ({ field_id: field.id, completed: true })),
          occupation: session.recipient_role === 'witness' ? occupation : undefined,
          address: session.recipient_role === 'witness' ? address : undefined,
        }),
      })
      sessionStorage.removeItem('esign_guest_csrf')
      setDone(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Signature submission failed') }
    finally { setBusy(false) }
  }

  if (busy && !session) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-foreground-muted"><Loader2 className="mr-2 size-5 animate-spin" /> Opening secure guest ceremony…</div>
  if (error && !session) return <div className="mx-auto max-w-md space-y-4 py-20 text-center"><h1 className="text-lg font-semibold">Guest ceremony unavailable</h1><p className="text-sm text-destructive">{error}</p><Button asChild variant="outline"><Link href="/">Return home</Link></Button></div>
  if (done) return <div className="mx-auto max-w-md space-y-4 py-20 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="text-xl font-semibold">Signature recorded</h1><p className="text-sm text-foreground-muted">Your guest ceremony is complete and the session has been consumed.</p></div>
  if (!session) return null

  return <div className="mx-auto max-w-3xl space-y-5 py-8">
    <div className="rounded-lg border border-border bg-surface p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h1 className="text-lg font-semibold">{session.title}</h1></div><p className="mt-2 text-sm text-foreground-muted">Secure {session.recipient_role.replace(/_/g, ' ')} ceremony for {session.recipient_name ?? 'guest signer'}.</p></div>
    {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <section className="rounded-lg border border-border bg-surface p-5"><h2 className="font-semibold">Documents</h2><ul className="mt-3 space-y-2">{(session.documents ?? []).map((document) => <li key={document.id}><Button asChild variant="outline"><a href={document.download_url} target="_blank" rel="noreferrer">Review {document.original_filename}</a></Button></li>)}</ul></section>
    {session.consent_required ? <section className="space-y-4 rounded-lg border border-border bg-surface p-5"><h2 className="font-semibold">Electronic records consent</h2><pre className="max-h-64 whitespace-pre-wrap overflow-y-auto text-sm text-foreground-muted">{session.consent_disclosure_text}</pre><Button disabled={busy || !csrf} onClick={() => void consent()}>I agree and continue</Button></section> : <section className="space-y-4 rounded-lg border border-border bg-surface p-5"><h2 className="font-semibold">Adopt and sign</h2><div><Label htmlFor="guest-name">Full legal name</Label><Input id="guest-name" value={typedName} onChange={(event) => setTypedName(event.target.value)} /></div>{session.recipient_role === 'witness' && <><div><Label htmlFor="guest-occupation">Occupation</Label><Input id="guest-occupation" value={occupation} onChange={(event) => setOccupation(event.target.value)} /></div><div><Label htmlFor="guest-address">Address</Label><Textarea id="guest-address" value={address} onChange={(event) => setAddress(event.target.value)} /></div></>}<p className="rounded border border-border bg-surface-muted p-4 text-center font-serif text-3xl italic">{typedName || 'Your signature'}</p><Button disabled={busy || !csrf || !typedName.trim() || (session.recipient_role === 'witness' && (!occupation.trim() || !address.trim()))} onClick={() => void submit()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Finish signing</Button></section>}
  </div>
}
