// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CrmContext, type CrmContext as Context } from './lib/auth'
import { useQuery, useQueryClient } from './lib/query'
import { useMoney } from './lib/format'
import { SharedClientPanel } from './components/crm/SharedClientPanel'
import type { Account } from './api/types'

vi.mock('./api/client', () => ({ get: vi.fn(async () => []), post: vi.fn() }))
vi.mock('./components/ui/Toast', () => ({ useToast: () => ({ error: vi.fn(), toast: vi.fn() }) }))

const context = (firm = 'firm-a', user = 'user-a', share = false, currency = 'USD') => ({
  firm_id: firm, firm_name: firm, user: { id: user, role: 'staff' }, can_share_clients: share,
  settings: { default_currency: currency, stale_opportunity_days: 21, conflict_match_threshold: 0.82, admin_bypasses_walls: true },
}) as Context
let host: HTMLDivElement
let root: Root
let client: QueryClient
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  host.remove()
})
async function render(value: Context, children: ReactNode) {
  await act(async () => root.render(<QueryClientProvider client={client}><CrmContext.Provider value={value}>{children}</CrmContext.Provider></QueryClientProvider>))
}

it('never reuses another firm or user’s cached records and invalidates only the active scope', async () => {
  client.setQueryData(['firmcrm', 'user-a', 'firm-a', 'accounts'], 'Firm A confidential')
  client.setQueryData(['firmcrm', 'user-a', 'firm-b', 'accounts'], 'Firm B records')
  client.setQueryData(['firmcrm', 'user-b', 'firm-b', 'accounts'], 'User B records')
  function Probe() {
    const records = useQuery({ queryKey: ['accounts'], queryFn: async () => 'unexpected fetch', staleTime: Infinity })
    const scopedClient = useQueryClient()
    return <button onClick={() => scopedClient.invalidateQueries({ queryKey: ['accounts'], refetchType: 'none' })}>{records.data}</button>
  }
  await render(context(), <Probe />)
  expect(host.textContent).toBe('Firm A confidential')
  await render(context('firm-b'), <Probe />)
  expect(host.textContent).toBe('Firm B records')
  await render(context('firm-b', 'user-b'), <Probe />)
  expect(host.textContent).toBe('User B records')
  await act(async () => host.querySelector('button')!.click())
  expect(client.getQueryState(['firmcrm', 'user-b', 'firm-b', 'accounts'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['firmcrm', 'user-a', 'firm-a', 'accounts'])?.isInvalidated).toBe(false)
})

it('updates monetary values when firm currency changes', async () => {
  function Money() { const money = useMoney(); return <span>{money(1234)}</span> }
  await render(context(), <Money />)
  expect(host.textContent).toBe('$1,234')
  await render(context('firm-b', 'user-a', false, 'GBP'), <Money />)
  expect(host.textContent).toBe('£1,234')
})

it('requires combined CRM and shared-client permission before offering publication', async () => {
  const account = { id: 1, name: 'Example', industry: 'Software', shared_client_id: null } as Account
  await render(context(), <SharedClientPanel account={account} contacts={[]} />)
  expect(host.textContent).not.toContain('Link or publish')
  await render(context('firm-a', 'manager', true), <SharedClientPanel account={account} contacts={[]} />)
  expect(host.textContent).toContain('Link or publish as client')
  await act(async () => host.querySelector('button')!.click())
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Linked accounts cannot have an account-level ethical wall')
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Example')
})
