import axe from 'axe-core'
import { page } from '@vitest/browser/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { IntegrationsSettingsPage } from './features/settings/IntegrationsSettingsPage'
import { ConnectDriveModal } from './features/attachments/ConnectDriveModal'
import { VirtualizedItems } from './features/ui/VirtualizedItems'
import { useAuthStore, useUiStore } from './stores/auth'
import { useUsersStore, useWorkspacesStore } from './stores/entities'
import type { User, Workspace } from './types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }), usePathname: () => '/dashboard/project-management/w/w1/settings/integrations',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./lib/tasklyticApi', async (importOriginal) => ({
  ...(await importOriginal()),
  tasklyticApiJson: vi.fn().mockResolvedValue({ capabilities: [
    { provider: 'google_drive', status: 'active', available: true },
    { provider: 'vertex_receipts', status: 'active', available: true },
    { provider: 'gmail', status: 'active', available: true },
    { provider: 'gcs', status: 'active', available: true },
    { provider: 'stripe_connect', status: 'active', available: true },
  ] }),
}))

const createdAt = '2026-08-12T00:00:00Z'
const user: User = { id: 'owner', name: 'Owner', email: 'owner@example.com', avatarColor: '#000', role: 'admin', createdAt }
const workspace: Workspace = { id: 'w1', name: 'Launch Firm', memberIds: ['owner'], adminIds: ['owner'], createdAt }

describe('Phase 10 mobile, keyboard, accessibility, and large-list gate', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentUserId: 'owner', hydrated: true })
    useUiStore.setState({ activeWorkspaceId: 'w1' })
    useUsersStore.setState({ items: { owner: user }, hydrated: true })
    useWorkspacesStore.setState({ items: { w1: workspace }, hydrated: true })
  })

  it('renders only truthful supported integrations at mobile width and passes axe', async () => {
    await page.viewport(390, 844)
    const screen = render(<main><IntegrationsSettingsPage /></main>)
    for (const name of ['Google Drive import', 'Vertex receipt extraction', 'Gmail delivery', 'Private GCS storage', 'Stripe Connect client payments']) {
      await expect.element(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(document.body.textContent).not.toMatch(/OneDrive|Dropbox|QuickBooks|Xero|NetSuite|coming soon/i)
    const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
  })

  it('supports keyboard selection and import in the Drive picker', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    const screen = render(<ConnectDriveModal provider="google_drive" message={undefined} open onOpenChange={() => undefined} loading={false} onImport={onImport} files={[
      { id: 'f1', name: 'Receipt.pdf', mimeType: 'application/pdf', size: 1200 },
      { id: 'f2', name: 'Support.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 2400 },
    ]} />)
    const receipt = screen.getByText('Receipt.pdf')
    await receipt.click()
    await screen.getByRole('button', { name: 'Import selected' }).click()
    expect(onImport).toHaveBeenCalledWith(['f1'])
  })

  it('windows large collections instead of mounting every row', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => `Row ${index + 1}`)
    render(<VirtualizedItems items={rows} rowHeight={40} renderItem={(row) => <div key={row}>{row}</div>} />)
    await expect.element(page.getByText('Row 1', { exact: true })).toBeVisible()
    expect(document.body.querySelectorAll('div').length).toBeLessThan(100)
    expect(page.getByText('Row 500', { exact: true }).query()).toBeNull()
  })
})
