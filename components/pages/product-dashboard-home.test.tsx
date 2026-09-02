// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PRODUCT_CATALOG, PRODUCT_GROUPS } from '@/lib/product-catalog'

const state = vi.hoisted(() => ({
  billing: { data: { plan_code: 'free' }, isLoading: false, isPending: false, isError: false },
  analytics: { data: { needs_onboarding: true }, isLoading: false, isPending: false, isError: false },
  activation: { data: { has_key: false, revoked: false }, isLoading: false, isPending: false, isError: false },
}))

vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'user-1' } }) }))
vi.mock('@/hooks/useUserProfile', () => ({
  useCurrentUser: () => ({ user: { display_name: 'Avery', email: 'avery@example.com' }, isLoading: false }),
}))
vi.mock('@/hooks/useBilling', () => ({ useBillingAccount: () => state.billing }))
vi.mock('@/hooks/useAnalyticsTeam', () => ({ useAnalyticsFirmOnboardingStatus: () => state.analytics }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.activation }))
vi.mock('@/lib/api', () => ({ apiClient: { getActivation: vi.fn() } }))

import { ProductDashboardHome } from './product-dashboard-home'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('product dashboard home', () => {
  it('renders all products in the canonical capability groups with live destinations', async () => {
    await act(async () => root.render(<ProductDashboardHome />))

    expect(host.querySelector('h1')?.textContent).toBe('Welcome back, Avery.')
    expect(Array.from(host.querySelectorAll('h2')).map((node) => node.textContent)).toEqual(
      PRODUCT_GROUPS.map((group) => group.name),
    )
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[aria-label^="Open "]'))
    expect(links).toHaveLength(11)
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      PRODUCT_GROUPS.flatMap((group) => (
        PRODUCT_CATALOG.filter((product) => product.groupId === group.id).map((product) => product.appHref)
      )),
    )
    expect(host.textContent).toContain('Paid')
    expect(host.textContent).toContain('Setup required')
    expect(host.textContent).toContain('Free')
  })

  it('keeps every card navigable when access checks fail', async () => {
    state.billing = { data: undefined as never, isLoading: false, isPending: false, isError: true }
    state.analytics = { data: undefined as never, isLoading: false, isPending: false, isError: true }
    state.activation = { data: undefined as never, isLoading: false, isPending: false, isError: true }
    await act(async () => root.render(<ProductDashboardHome />))

    expect(host.textContent).toContain('Access unknown')
    expect(host.querySelectorAll('a[aria-label^="Open "]')).toHaveLength(11)
  })
})
