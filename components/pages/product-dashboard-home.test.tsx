// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PRODUCT_CATALOG, PRODUCT_GROUPS } from '@/lib/product-catalog'

vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}))
vi.mock('@/hooks/useUserProfile', () => ({
  useCurrentUser: () => ({ user: { display_name: 'Avery', email: 'avery@example.com' }, isLoading: false }),
}))

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
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[aria-label^="Go to "]'))
    expect(links).toHaveLength(11)
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      PRODUCT_GROUPS.flatMap((group) => (
        PRODUCT_CATALOG.filter((product) => product.groupId === group.id).map((product) => product.appHref)
      )),
    )
    expect(host.textContent).not.toContain('Open product')
    expect(host.textContent).not.toContain('Setup required')
    expect(host.textContent).not.toContain('purpose-built products')
  })

  it('omits dashboard chrome that competes with the product catalog', async () => {
    await act(async () => root.render(<ProductDashboardHome />))

    const removedCopy = [
      'Your connected workspace',
      'Everything your team needs',
      'Workspace / All products',
      'Choose the right tool for the work in front of you',
      '04 areas',
    ]
    removedCopy.forEach((copy) => expect(host.textContent).not.toContain(copy))
    expect(host.textContent).not.toMatch(/\d{2} products/)
    const productIndex = host.querySelector('[aria-label="Product categories"]')
    expect(productIndex?.querySelectorAll('small')).toHaveLength(0)
    expect(host.querySelectorAll('a[aria-label^="Go to "]')).toHaveLength(11)
  })
})
