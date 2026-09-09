// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api'
import { CrmContext, type CrmContext as Context } from '../lib/auth'
import SettingsPage from './SettingsPage'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'current' } }) }))
vi.mock('@/lib/api', () => ({
  apiClient: {
    getCurrentAnalyticsFirm: vi.fn(),
    generateAnalyticsFirmInviteCode: vi.fn(async () => ({ code: 'NEW123' })),
    updateAnalyticsFirmMember: vi.fn(async () => ({})),
  },
  ApiError: class extends Error {},
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn(), error: vi.fn() }) }))
vi.mock('../api/client', () => ({ patch: vi.fn() }))

let host: HTMLDivElement
let root: Root
let client: QueryClient
const context = {
  firm_id: 'shared-firm', firm_name: 'Shared firm', user: { id: 'current', role: 'admin' },
  settings: { default_currency: 'USD', stale_opportunity_days: 21, conflict_match_threshold: 0.82, admin_bypasses_walls: true },
  access_revision: 1, can_share_clients: true,
} as Context

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  host.remove()
})

async function render(platformRole = 'admin', crmRole: Context['user']['role'] = 'admin') {
  const firm = {
    firm: { id: 'shared-firm', name: 'Shared firm' }, invite_code: 'ABC123',
    members: [
      { user_id: 'current', email: 'current@example.com', role: platformRole },
      { user_id: 'colleague', email: 'colleague@example.com', role: 'analyst' },
    ],
  }
  vi.mocked(apiClient.getCurrentAnalyticsFirm).mockResolvedValue(firm as never)
  client.setQueryData(['analytics', 'firm', 'current'], firm)
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <CrmContext.Provider value={{ ...context, user: { ...context.user, role: crmRole } }}>
        <SettingsPage />
      </CrmContext.Provider>
    </QueryClientProvider>,
  ))
}

it('shows the shared firm and invitation code inside FirmCRM and regenerates through the shared API', async () => {
  await render()
  expect(host.textContent).toContain('Shared firm')
  expect(host.textContent).toContain('shared-firm')
  expect(host.textContent).toContain('ABC123')
  expect(host.textContent).toContain('colleague@example.com')
  const regenerate = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Regenerate')!
  await act(async () => regenerate.click())
  expect(apiClient.generateAnalyticsFirmInviteCode).toHaveBeenCalledOnce()
})

it('uses platform membership permissions even when the current member is a CRM administrator', async () => {
  await render('analyst', 'admin')
  expect(host.textContent).toContain('colleague@example.com')
  expect(host.textContent).not.toContain('Regenerate')
  expect(host.querySelector('select')).toBeNull()
  await act(async () => Array.from(host.querySelectorAll('[role="tab"]')).find(tab => tab.textContent === 'CRM settings')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(host.querySelector('button[type="submit"]')).not.toBeNull()
})

it('allows ordinary firm members to view the directory and keeps CRM business rules read-only', async () => {
  await render('analyst', 'staff')
  expect(host.textContent).toContain('colleague@example.com')
  expect(host.querySelector('select')).toBeNull()
  await act(async () => Array.from(host.querySelectorAll('[role="tab"]')).find(tab => tab.textContent === 'CRM settings')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(host.querySelector('button[type="submit"]')).toBeNull()
  expect(Array.from(host.querySelectorAll('input')).every(input => input.disabled)).toBe(true)
})

it('updates shared roles and invalidates the active CRM context and member pickers only', async () => {
  client.setQueryData(['firmcrm-context', 'current'], context)
  client.setQueryData(['firmcrm', 'current', 'shared-firm', 'users'], [])
  client.setQueryData(['firmcrm-context', 'another-user'], context)
  client.setQueryData(['firmcrm', 'another-user', 'other-firm', 'users'], [])
  await render()
  const role = host.querySelector('select')!
  await act(async () => {
    role.value = 'admin'
    role.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(apiClient.updateAnalyticsFirmMember).toHaveBeenCalledWith('colleague', { role: 'admin' })
  expect(client.getQueryState(['firmcrm-context', 'current'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['firmcrm', 'current', 'shared-firm', 'users'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['firmcrm-context', 'another-user'])?.isInvalidated).toBe(false)
  expect(client.getQueryState(['firmcrm', 'another-user', 'other-firm', 'users'])?.isInvalidated).toBe(false)
})
