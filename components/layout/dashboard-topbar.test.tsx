// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}))
vi.mock('next/image', () => ({
  default: ({ priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ''} />
  },
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { displayName: 'Test User', email: 'test@example.com' },
    signOut: vi.fn(),
  }),
}))
vi.mock('@/hooks/useUserProfile', () => ({
  useCurrentUser: () => ({ user: null }),
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, modal }: { children: ReactNode; modal?: boolean }) => (
    <div data-dropdown-modal={String(modal)}>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}))
vi.mock('./dashboard-breadcrumbs', () => ({
  DashboardBreadcrumbs: () => null,
}))

import { DashboardTopbar } from './dashboard-topbar'
import { PRODUCT_CATALOG } from '@/lib/product-catalog'

describe('DashboardTopbar', () => {
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
    vi.restoreAllMocks()
  })

  it('keeps the account menu from locking the scrolled document', async () => {
    await act(async () => root.render(<DashboardTopbar />))

    expect(host.querySelector('[data-dropdown-modal]')?.getAttribute('data-dropdown-modal')).toBe('false')
  })

  it('links the logo to the public homepage', async () => {
    await act(async () => root.render(<DashboardTopbar />))

    expect(host.querySelector('a[aria-label="CPAAutomation home"]')?.getAttribute('href')).toBe('/')
  })

  it('only links to all products from within a product', async () => {
    await act(async () => root.render(<DashboardTopbar />))
    expect(host.textContent).not.toContain('All products')

    await act(async () => root.render(<DashboardTopbar product={PRODUCT_CATALOG[0]} />))

    const allProductsLink = Array.from(host.querySelectorAll('a')).find(
      (link) => link.textContent === 'All products',
    )
    expect(allProductsLink?.getAttribute('href')).toBe('/dashboard')
  })

  it('leaves the product name to the breadcrumb instead of repeating it', async () => {
    const product = PRODUCT_CATALOG[0]
    await act(async () => root.render(<DashboardTopbar product={product} />))

    expect(host.textContent).not.toContain(product.name)
  })
})
