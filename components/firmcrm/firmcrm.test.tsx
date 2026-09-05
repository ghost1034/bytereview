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

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/dashboard/firmcrm' }))

vi.mock('@/components/layout/dashboard-module-chrome', () => ({ useDashboardModuleChrome: vi.fn() }))

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

it('keeps activity links inside the FirmCRM module', async () => {
  const { ActivityTimeline } = await import('./components/crm/ActivityTimeline')
  const { ConfirmProvider } = await import('./components/ui/Confirm')
  const filter = { account_id: 7 }
  const activity = { id: 1, kind: 'note', subject: 'QA note', occurred_at: '2026-09-05T12:00:00Z', account_id: 7, account_name: 'QA Account' }
  client.setQueryData(['firmcrm', 'user-a', 'firm-a', 'activities', filter], {
    items: [activity, { ...activity, id: 2, opportunity_id: 9, opportunity_name: 'QA Opportunity' }], total: 2,
  })
  client.setQueryDefaults(['firmcrm', 'user-a', 'firm-a', 'activities'], { staleTime: Infinity })
  await render(context(), <ConfirmProvider><ActivityTimeline filter={filter} readOnly linkTo /></ConfirmProvider>)
  expect(Array.from(host.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
    '/dashboard/firmcrm/accounts/7', '/dashboard/firmcrm/opportunities/9',
  ])
})

it('shows administrators and inherited owners in partner selectors without offering unrelated staff', async () => {
  const { partnerOptions } = await import('./lib/hooks')
  const { SchemaForm } = await import('./components/ui/Form')
  const users = [
    { id: 'admin', role: 'admin', full_name: 'Firm Administrator' },
    { id: 'partner', role: 'partner', full_name: 'Partner' },
    { id: 'owner', role: 'staff', full_name: 'Inherited Owner' },
    { id: 'other', role: 'staff', full_name: 'Other Staff' },
  ] as import('./api/types').User[]
  for (const selected of ['admin', 'owner']) {
    await render(context(), <SchemaForm fields={[{ name: 'partner', label: 'Responsible partner', type: 'select', options: partnerOptions(users, selected) }]} values={{ partner: selected }} onChange={() => {}} />)
    const select = host.querySelector('select')!
    expect(select.value).toBe(selected)
    expect(Array.from(select.options, (option) => option.value)).not.toContain('other')
    expect(Array.from(select.options, (option) => option.value)).toContain('partner')
  }
})

it('loads primary contacts for the selected account and clears the contact when the account changes', async () => {
  const { NewOpportunityModal } = await import('./pages/OpportunitiesPage')
  client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } })
  const seed = (key: unknown[], data: unknown) => client.setQueryData(['firmcrm', 'user-a', 'firm-a', ...key], data)
  seed(['users'], [])
  seed(['practice-areas', true], [])
  seed(['accounts', 'all'], { items: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }] })
  seed(['contacts', 'referrers'], { items: [] })
  seed(['contacts', 'acct', 1], { items: [{ id: 11, full_name: 'Alpha Contact' }] })
  seed(['contacts', 'acct', 2], { items: [{ id: 22, full_name: 'Beta Contact' }] })
  await render(context(), <NewOpportunityModal onClose={() => {}} />)
  const field = (name: string) => host.querySelector<HTMLSelectElement>(`select[id$="-${name}"]`)!
  const change = async (name: string, value: string) => {
    await act(async () => { const select = field(name); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
  }
  await change('account_id', '1')
  expect(field('primary_contact_id').textContent).toContain('Alpha Contact')
  await change('primary_contact_id', '11')
  await change('account_id', '2')
  expect(field('primary_contact_id').value).toBe('')
  expect(field('primary_contact_id').textContent).toContain('Beta Contact')
  expect(field('primary_contact_id').textContent).not.toContain('Alpha Contact')
})

it('saves the selected task due date at local midnight instead of shifting it to the previous day', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const { ActivityTimeline } = await import('./components/crm/ActivityTimeline')
  const { ConfirmProvider } = await import('./components/ui/Confirm')
  const { post } = await import('./api/client')
  vi.mocked(post).mockClear()
  const filter = { opportunity_id: 9 }
  client.setQueryData(['firmcrm', 'user-a', 'firm-a', 'activities', filter], { items: [] })
  client.setQueryDefaults(['firmcrm', 'user-a', 'firm-a', 'activities'], { staleTime: Infinity })
  await render(context(), <ConfirmProvider><ActivityTimeline filter={filter} /></ConfirmProvider>)
  const user = userEvent.setup()
  await act(async () => {
    await user.click(Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'task')!)
    await user.type(host.querySelector('[aria-label="Subject"]')!, 'QA date')
    const due = host.querySelector<HTMLInputElement>('input[type="date"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(due, '2026-09-10')
    due.dispatchEvent(new Event('input', { bubbles: true }))
    due.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(post).toHaveBeenCalledWith('/activities', expect.objectContaining({ due_at: new Date(2026, 8, 10).toISOString() }))
})

it('finds closed opportunities in global CRM search', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const { default: Shell } = await import('./components/layout/Shell')
  const { get } = await import('./api/client')
  vi.mocked(get).mockImplementation(async (path) => ({ items: path === '/opportunities' ? [{ id: 9, name: 'QA Won Matter' }] : [] }))
  await render(context(), <Shell><span>Page</span></Shell>)
  const user = userEvent.setup()
  await act(async () => { await user.type(host.querySelector('[aria-label="Search CRM"]')!, 'QA') })
  await vi.waitFor(() => expect(host.textContent).toContain('QA Won Matter'))
  expect(get).toHaveBeenCalledWith('/opportunities', { q: 'QA', limit: 5, status: 'all' })
  vi.mocked(get).mockImplementation(async () => [])
})
