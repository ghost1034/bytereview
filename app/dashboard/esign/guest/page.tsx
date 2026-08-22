'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, ShieldAlert } from 'lucide-react'

import { EsignAccountGate } from '@/components/esign/EsignAccountGate'
import {
  SigningCeremony,
  type SigningCeremonyTransport,
} from '@/components/esign/sign/SigningCeremony'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import type { components } from '@/lib/api-types'
import type { EsignSigningSessionResponse } from '@/lib/api'

type Attachment = components['schemas']['EsignSignerAttachmentResponse']

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail ?? `Guest request failed (${response.status})`)
  }
  return response.json()
}

export default function GuestSigningPage() {
  const search = useSearchParams()
  const { loading: authLoading, user } = useAuth()
  const [continueAsGuest, setContinueAsGuest] = React.useState(search.get('continue') === 'guest')
  const [sessionId, setSessionId] = React.useState<string | null>(search.get('session'))
  const [csrf, setCsrf] = React.useState<string | null>(() => {
    const existingSession = search.get('session')
    return existingSession && typeof window !== 'undefined'
      ? sessionStorage.getItem(`esign_guest_csrf_${existingSession}`)
      : null
  })
  const [session, setSession] = React.useState<EsignSigningSessionResponse | null>(null)
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const searchString = search.toString()
  const redirectTo = `/esign/guest${searchString ? `?${searchString}` : ''}`
  const invitation = search.get('token')
  const existingSession = search.get('session')
  const powerFormVerification = search.get('powerform_token')

  const ceremonyFetch = React.useCallback(async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const headers = new Headers(options.headers)
    if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`)
    return fetch(input, { ...options, headers })
  }, [user])

  const guestRequest = React.useCallback(async <T,>(path: string, options: RequestInit = {}) => {
    if (!sessionId) throw new Error('Guest session is unavailable')
    const headers = new Headers(options.headers)
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    if (options.method && options.method !== 'GET') {
      if (!csrf) throw new Error('Guest session security token is unavailable; reopen the email link')
      headers.set('X-CSRF-Token', csrf)
    }
    return parseResponse<T>(await ceremonyFetch(`/api/esign/guest/sessions/${sessionId}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    }))
  }, [ceremonyFetch, csrf, sessionId])

  const load = React.useCallback(async () => {
    if (authLoading || (!user && !continueAsGuest)) return
    setBusy(true)
    setError(null)
    try {
      let token = invitation
      if (powerFormVerification) {
        const verified = await parseResponse<{ invitation_token: string }>(await ceremonyFetch(
          '/api/esign/public/powerforms/verification/exchange',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: powerFormVerification }) },
        ))
        token = verified.invitation_token
      }

      let currentId = existingSession
      let currentCsrf = existingSession ? sessionStorage.getItem(`esign_guest_csrf_${existingSession}`) : null
      if (token) {
        const exchanged = await parseResponse<{ session_id: string; csrf_token: string }>(await ceremonyFetch(
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
      const current = await parseResponse<EsignSigningSessionResponse>(await ceremonyFetch(
        `/api/esign/guest/sessions/${currentId}`,
        { credentials: 'include' },
      ))
      setSession(current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Guest invitation could not be opened')
    } finally {
      setBusy(false)
    }
  }, [authLoading, ceremonyFetch, continueAsGuest, existingSession, invitation, powerFormVerification, user])

  React.useEffect(() => { void load() }, [load])

  const transport = React.useMemo<SigningCeremonyTransport>(() => ({
    access: 'guest',
    recordConsent: (expectedRoutingVersion) => guestRequest('/consent', {
      method: 'POST',
      body: JSON.stringify({ expected_routing_version: expectedRoutingVersion }),
    }),
    saveProgress: ({ fieldValues, expectedRoutingVersion, marks }) => guestRequest('/progress', {
      method: 'PUT',
      body: JSON.stringify({ expected_routing_version: expectedRoutingVersion, field_values: fieldValues, marks }),
    }),
    submit: async (payload) => {
      const result = await guestRequest<components['schemas']['EsignSubmitResponse']>('/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (sessionId) sessionStorage.removeItem(`esign_guest_csrf_${sessionId}`)
      return result
    },
    decline: async (reason, expectedRoutingVersion) => {
      await guestRequest('/decline', {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim(), expected_routing_version: expectedRoutingVersion }),
      })
      if (sessionId) sessionStorage.removeItem(`esign_guest_csrf_${sessionId}`)
    },
    uploadAttachment: async (fieldId, file) => {
      const form = new FormData()
      form.append('field_id', fieldId)
      form.append('file', file)
      return guestRequest<Attachment>('/attachments', { method: 'POST', body: form })
    },
    deleteAttachment: (attachmentId) => guestRequest(`/attachments/${attachmentId}`, { method: 'DELETE' }),
    reassign: async (payload) => {
      await guestRequest('/reassign', { method: 'POST', body: JSON.stringify(payload) })
      if (sessionId) sessionStorage.removeItem(`esign_guest_csrf_${sessionId}`)
    },
    approve: async (expectedRoutingVersion) => {
      await guestRequest('/approve', {
        method: 'POST', body: JSON.stringify({ expected_routing_version: expectedRoutingVersion }),
      })
      if (sessionId) sessionStorage.removeItem(`esign_guest_csrf_${sessionId}`)
    },
    completeManagerStep: async (expectedRoutingVersion) => {
      await guestRequest('/manager-complete', {
        method: 'POST', body: JSON.stringify({ expected_routing_version: expectedRoutingVersion }),
      })
      if (sessionId) sessionStorage.removeItem(`esign_guest_csrf_${sessionId}`)
    },
    updateManagedRecipients: (payload) => guestRequest('/managed-recipients', {
      method: 'PATCH', body: JSON.stringify(payload),
    }),
    configureWitness: (payload) => guestRequest('/witness', {
      method: 'PUT', body: JSON.stringify(payload),
    }),
    downloadCompleted: async (kind) => {
      const result = await parseResponse<{ url: string }>(await ceremonyFetch(
        `/api/esign/guest/sessions/${sessionId}/completed/${kind}`,
        { credentials: 'include' },
      ))
      window.location.assign(result.url)
    },
    refresh: () => guestRequest<EsignSigningSessionResponse>('', { method: 'GET' }),
  }), [ceremonyFetch, guestRequest, sessionId])

  if (authLoading || (!user && !continueAsGuest)) {
    return <EsignAccountGate redirectTo={redirectTo} onContinueAsGuest={() => setContinueAsGuest(true)} />
  }

  if (busy && !session) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-foreground-muted"><Loader2 className="mr-2 size-5 animate-spin" /> Opening secure ceremony…</div>
  }

  if (error && !session) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-20 text-center">
        <ShieldAlert className="mx-auto size-10 text-warning" />
        <h1 className="text-lg font-semibold">Secure ceremony unavailable</h1>
        <p className="text-sm text-destructive">{error}</p>
        <Button asChild variant="outline"><Link href="/">Return home</Link></Button>
      </div>
    )
  }

  if (!session) return null

  return (
    <SigningCeremony
      initialSession={session}
      transport={transport}
      displayName={user?.displayName}
      stickyTopClassName="top-[var(--header-height)]"
    />
  )
}
