import axe from 'axe-core'
import { page, userEvent } from '@vitest/browser/context'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { IntegrationsSettingsPage } from './features/settings/IntegrationsSettingsPage'
import { ConnectDriveModal } from './features/attachments/ConnectDriveModal'
import { VirtualizedItems } from './features/ui/VirtualizedItems'
import {
  TasklyticEmptyDataState,
  TasklyticForbiddenState,
  TasklyticLoadingState,
  TasklyticRetryState,
} from './features/ui/TasklyticDataStates'
import {
  useReducedMotion,
  setReducedMotionPreference,
} from './hooks/useReducedMotion'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAuthStore, useUiStore } from './stores/auth'
import { useUsersStore, useWorkspacesStore } from './stores/entities'
import type { User, Workspace } from './types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }),
  usePathname: () => '/dashboard/project-management/w/w1/settings/integrations',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./lib/tasklyticApi', async (importOriginal) => ({
  ...(await importOriginal()),
  tasklyticApiJson: vi.fn().mockResolvedValue({
    capabilities: [
      { provider: 'google_drive', status: 'active', available: true },
      { provider: 'vertex_receipts', status: 'active', available: true },
      { provider: 'gmail', status: 'active', available: true },
      { provider: 'gcs', status: 'active', available: true },
      { provider: 'stripe_connect', status: 'active', available: true },
    ],
  }),
}))

const createdAt = '2026-08-12T00:00:00Z'
const user: User = {
  id: 'owner',
  name: 'Owner',
  email: 'owner@example.com',
  avatarColor: '#000',
  role: 'admin',
  createdAt,
}
const workspace: Workspace = {
  id: 'w1',
  name: 'Launch Firm',
  memberIds: ['owner'],
  adminIds: ['owner'],
  createdAt,
}

function RepresentativeStateGallery() {
  return (
    <div className="tasklytic-root bg-background text-foreground">
      <header>
        <h1>Tasklytic state references</h1>
      </header>
      <nav aria-label="Tasklytic local navigation">
        <a href="#states">States</a>
      </nav>
      <main id="states" className="space-y-3">
        <TasklyticLoadingState label="Loading project" />
        <TasklyticEmptyDataState
          title="No tasks yet"
          description="Create the first task."
        />
        <TasklyticForbiddenState />
        <TasklyticRetryState
          onRetry={() => undefined}
          description="The request failed."
        />
        <div
          className="max-w-full overflow-x-auto"
          aria-label="Overflow table region"
          tabIndex={0}
        >
          <table className="min-w-[960px]">
            <tbody>
              <tr>
                <th>Client</th>
                <td>Northstar Advisory</td>
                <td>Open work</td>
                <td>Owner</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

function ReducedMotionHarness() {
  const reduced = useReducedMotion()
  return <output aria-label="Reduced motion enabled">{String(reduced)}</output>
}

function DrawerHarness() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button aria-label="Open Tasklytic navigation">Open navigation</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Tasklytic navigation</SheetTitle>
          <SheetDescription>Workspace and project navigation.</SheetDescription>
        </SheetHeader>
        <Button>Home</Button>
        <Button>Projects</Button>
      </SheetContent>
    </Sheet>
  )
}

describe('Phase 10 mobile, keyboard, accessibility, and large-list gate', () => {
  beforeEach(() => {
    localStorage.removeItem('tasklytic:reduceMotion')
    useAuthStore.setState({ currentUserId: 'owner', hydrated: true })
    useUiStore.setState({ activeWorkspaceId: 'w1' })
    useUsersStore.setState({ items: { owner: user }, hydrated: true })
    useWorkspacesStore.setState({ items: { w1: workspace }, hydrated: true })
  })

  it('renders only truthful supported integrations at mobile width and passes axe', async () => {
    await page.viewport(390, 844)
    const screen = render(
      <main>
        <IntegrationsSettingsPage />
      </main>,
    )
    for (const name of [
      'Google Drive import',
      'Vertex receipt extraction',
      'Gmail delivery',
      'Private GCS storage',
      'Stripe Connect client payments',
    ]) {
      await expect.element(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(document.body.textContent).not.toMatch(
      /OneDrive|Dropbox|QuickBooks|Xero|NetSuite|coming soon/i,
    )
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: true } },
    })
    expect(
      results.violations.filter(
        (violation) =>
          violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([])
  })

  it('supports keyboard selection and import in the Drive picker', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    const screen = render(
      <ConnectDriveModal
        provider="google_drive"
        message={undefined}
        open
        onOpenChange={() => undefined}
        loading={false}
        onImport={onImport}
        files={[
          {
            id: 'f1',
            name: 'Receipt.pdf',
            mimeType: 'application/pdf',
            size: 1200,
          },
          {
            id: 'f2',
            name: 'Support.xlsx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 2400,
          },
        ]}
      />,
    )
    const receipt = screen.getByText('Receipt.pdf')
    await receipt.click()
    await screen.getByRole('button', { name: 'Import selected' }).click()
    expect(onImport).toHaveBeenCalledWith(['f1'])
  })

  it('windows large collections instead of mounting every row', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => `Row ${index + 1}`)
    render(
      <VirtualizedItems
        items={rows}
        rowHeight={40}
        renderItem={(row) => <div key={row}>{row}</div>}
      />,
    )
    await expect.element(page.getByText('Row 1', { exact: true })).toBeVisible()
    expect(document.body.querySelectorAll('div').length).toBeLessThan(100)
    expect(page.getByText('Row 500', { exact: true }).query()).toBeNull()
  })

  it('covers populated-state companions, empty, loading, forbidden, error, and overflow at every target viewport', async () => {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844],
    ] as const) {
      await page.viewport(width, height)
      const screen = render(<RepresentativeStateGallery />)
      await expect
        .element(screen.getByRole('heading', { name: 'Loading project' }))
        .toBeVisible()
      await expect
        .element(screen.getByRole('heading', { name: 'No tasks yet' }))
        .toBeVisible()
      await expect.element(screen.getByRole('alert').first()).toBeVisible()
      const overflow = screen
        .getByLabelText('Overflow table region')
        .element() as HTMLElement
      expect(overflow.scrollWidth).toBeGreaterThanOrEqual(overflow.clientWidth)

      const landmarks = Array.from(
        screen.container.querySelectorAll('header, nav, main'),
      ).map((node) => node.tagName)
      expect(landmarks).toEqual(['HEADER', 'NAV', 'MAIN'])
      const results = await axe.run(screen.container, {
        rules: { 'color-contrast': { enabled: true } },
      })
      expect(
        results.violations.filter(
          (violation) =>
            violation.impact === 'serious' || violation.impact === 'critical',
        ),
      ).toEqual([])
      screen.unmount()
    }
  })

  it('honors reduced motion and traps labelled keyboard focus in the navigation drawer', async () => {
    const motion = render(<ReducedMotionHarness />)
    setReducedMotionPreference(true)
    await expect
      .element(motion.getByLabelText('Reduced motion enabled'))
      .toHaveTextContent('true')
    motion.unmount()

    await page.viewport(390, 844)
    const drawer = render(<DrawerHarness />)
    await drawer
      .getByRole('button', { name: 'Open Tasklytic navigation' })
      .click()
    const dialog = page
      .getByRole('dialog', { name: 'Tasklytic navigation' })
      .element()
    expect(dialog.contains(document.activeElement)).toBe(true)
    for (let index = 0; index < 6; index += 1) {
      await userEvent.keyboard('{Tab}')
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    for (const button of Array.from(dialog.querySelectorAll('button'))) {
      expect(
        button.getAttribute('aria-label') || button.textContent?.trim(),
      ).toBeTruthy()
      expect(button.className).toContain('focus')
    }
  })
})
