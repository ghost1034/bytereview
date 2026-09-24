// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  search: new URLSearchParams(),
  replace: vi.fn(),
  auth: { loading: false, user: null as null | { displayName: string; getIdToken: ReturnType<typeof vi.fn> } },
  ceremony: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ envelopeId: 'envelope-id' }),
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => state.search,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }))
vi.mock('@/components/esign/EsignAccountGate', () => ({
  EsignAccountGate: ({ redirectTo }: { redirectTo: string }) => <div data-account-gate={redirectTo} />,
}))
vi.mock('@/components/esign/sign/SigningCeremony', () => ({
  SigningCeremony: (props: unknown) => { state.ceremony(props); return <div>Completed PDF</div> },
}))

import SigningEntryPage from '@/app/(general)/esign/sign/[envelopeId]/page'
import GuestSigningPage from '@/app/dashboard/esign/guest/page'

let element: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  state.search = new URLSearchParams()
  state.auth = { loading: false, user: null }
  window.history.replaceState({}, '', '/')
  sessionStorage.clear()
  element = document.createElement('div')
  root = createRoot(element)
  fetchMock = vi.fn(async (input: string) => ({
    ok: true,
    json: async () => input.endsWith('/exchange')
      ? { session_id: 'recipient-session', csrf_token: 'csrf' }
      : { envelope_status: 'completed', access_purpose: 'completed_copy', has_sealed_document: true },
  }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

describe('recipient email-link access', () => {
  it.each([false, true])('preserves the invitation instead of using account access (signed in: %s)', async (signedIn) => {
    state.search = new URLSearchParams({ guest_token: 'private/token+value' })
    if (signedIn) state.auth.user = { displayName: 'Other account', getIdToken: vi.fn() }
    await act(async () => root.render(<SigningEntryPage />))
    expect(state.replace).toHaveBeenCalledWith('/esign/guest?token=private%2Ftoken%2Bvalue&continue=guest')
    expect(element.querySelector('[data-account-gate]')).toBeNull()
  })

  it('keeps account-only links on the authenticated signing route', async () => {
    await act(async () => root.render(<SigningEntryPage />))
    expect(state.replace).not.toHaveBeenCalled()
    expect(element.querySelector('[data-account-gate]')?.getAttribute('data-account-gate'))
      .toBe('/dashboard/esign/sign/envelope-id')
  })

  it('opens a completed copy using its guest token despite an unrelated signed-in account', async () => {
    state.search = new URLSearchParams({ token: 'recipient-token', continue: 'guest' })
    const getIdToken = vi.fn().mockResolvedValue('unrelated-account-token')
    state.auth.user = { displayName: 'Other account', getIdToken }
    await act(async () => root.render(<GuestSigningPage />))
    expect(element.textContent).toContain('Completed PDF')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ invitation_token: 'recipient-token' })
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.get('Authorization')).toBeNull()
    }
    expect(getIdToken).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?session=recipient-session&continue=guest')
    expect(sessionStorage.getItem('esign_guest_csrf_recipient-session')).toBe('csrf')
    expect(state.ceremony.mock.lastCall?.[0].displayName).toBeUndefined()
    // Subsequent session requests must keep using the recipient's cookie too.
    await state.ceremony.mock.lastCall?.[0].transport.refresh()
    expect(fetchMock.mock.lastCall?.[1].headers.get('Authorization')).toBeNull()
  })

  it('retains guest access when a completed-copy session is reloaded', async () => {
    state.search = new URLSearchParams({ session: 'recipient-session', continue: 'guest' })
    state.auth.user = { displayName: 'Other account', getIdToken: vi.fn() }
    await act(async () => root.render(<GuestSigningPage />))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/esign/guest/sessions/recipient-session')
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBeNull()
    expect(element.textContent).toContain('Completed PDF')
  })

  it('still includes account identity when account access is explicitly used', async () => {
    state.search = new URLSearchParams({ token: 'recipient-token' })
    state.auth.user = { displayName: 'Recipient', getIdToken: vi.fn().mockResolvedValue('recipient-account-token') }
    await act(async () => root.render(<GuestSigningPage />))
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer recipient-account-token')
    expect(state.ceremony.mock.lastCall?.[0].displayName).toBe('Recipient')
  })

  it('shows a rejected invitation without falling back to account access', async () => {
    state.search = new URLSearchParams({ token: 'expired-token', continue: 'guest' })
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ detail: 'Guest invitation is invalid or expired' }) })
    await act(async () => root.render(<GuestSigningPage />))
    expect(element.textContent).toContain('Guest invitation is invalid or expired')
    expect(state.ceremony).not.toHaveBeenCalled()
    expect(state.replace).not.toHaveBeenCalled()
  })
})
