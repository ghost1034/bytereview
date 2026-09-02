// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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
  getProductForPathname: () => null,
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
})
