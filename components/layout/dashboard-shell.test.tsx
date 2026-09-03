// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigationState = vi.hoisted(() => ({ pathname: '/dashboard' }))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/components/ui/command', () => ({
  CommandDialog: ({ children, modal }: { children: ReactNode; modal?: boolean }) => (
    <div data-command-dialog-modal={String(modal)}>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input />,
  CommandItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/tour/product-tour', () => ({
  ProductTourProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/tour/welcome-tour-dialog', () => ({
  WelcomeTourDialog: () => null,
}))
vi.mock('@/lib/product-catalog', () => ({
  getProductForPathname: (pathname: string) => {
    if (pathname === '/dashboard') return null
    const isTaxAtlas = pathname.startsWith('/dashboard/taxatlas')
    return {
      id: isTaxAtlas ? 'taxatlas' : 'test-product',
      name: isTaxAtlas ? 'TaxAtlas' : 'Test product',
      appHref: isTaxAtlas ? '/dashboard/taxatlas' : '/dashboard/test-product',
      icon: () => null,
    }
  },
  isImmersiveDashboardPath: () => false,
  PRODUCT_CATALOG: [
    {
      id: 'test-product',
      name: 'Test product',
      appHref: '/dashboard/test-product',
      icon: () => null,
    },
  ],
}))
vi.mock('./dashboard-module-chrome', () => ({
  DashboardModuleChromeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRegisteredDashboardModuleChrome: () => null,
}))
vi.mock('./dashboard-topbar', () => ({
  DashboardTopbar: () => <header />,
}))
vi.mock('./product-local-nav', () => ({
  getProductLocalNavigation: () => [],
  ProductLocalNav: () => null,
}))

import { DashboardShell } from './dashboard-shell'

describe('DashboardShell', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigationState.pathname = '/dashboard'
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('keeps product search from locking the scrolled document', async () => {
    await act(async () => root.render(<DashboardShell>Content</DashboardShell>))

    expect(host.querySelector('[data-command-dialog-modal]')?.getAttribute('data-command-dialog-modal')).toBe('false')
  })

  it('scrolls to the top when entering a product', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    await act(async () => root.render(<DashboardShell>Products</DashboardShell>))
    expect(scrollTo).not.toHaveBeenCalled()

    navigationState.pathname = '/dashboard/test-product'
    await act(async () => root.render(<DashboardShell>Product workspace</DashboardShell>))

    expect(scrollTo).toHaveBeenCalledOnce()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })

  it('gives TaxAtlas a bounded viewport for its map and internal scrollers', async () => {
    navigationState.pathname = '/dashboard/taxatlas/map'
    await act(async () => root.render(<DashboardShell>TaxAtlas map</DashboardShell>))

    const shell = host.firstElementChild
    const main = host.querySelector('#main-content')

    expect(shell?.classList.contains('h-dvh')).toBe(true)
    expect(shell?.classList.contains('max-h-dvh')).toBe(true)
    expect(shell?.classList.contains('overflow-hidden')).toBe(true)
    expect(main?.classList.contains('overflow-hidden')).toBe(true)
  })
})
