// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountsApi, conflictsApi } from '../api';
import { ApiError } from '../api/client';
import type { Account } from '../api/types';
import { CrmContext, type CrmContext as Context } from '../lib/auth';
import ClearancePage from './ClearancePage';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/dashboard/firmcrm/clearance' }));
vi.mock('../api', () => ({ accountsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() }, conflictsApi: { list: vi.fn(), search: vi.fn() } }));
vi.mock('@/lib/firebase', () => ({ getCurrentAuthToken: vi.fn() }));
const notifications = vi.hoisted(() => ({ toast: vi.fn(), error: vi.fn() }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => notifications }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const context = { firm_id: 'firm-a', user: { id: 'staff', role: 'staff' }, settings: { default_currency: 'USD' } } as Context;
const company = { id: 12, name: 'Northstar Industries', aliases: 'Blue Harbor', description: 'Adverse relationship', account_type: 'adverse_party', is_archived: false } as Account;
const page = (items: Account[] = []) => ({ items, total: items.length, limit: 25, offset: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(accountsApi.list).mockResolvedValue(page());
  vi.mocked(conflictsApi.list).mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><CrmContext.Provider value={context}><ClearancePage /></CrmContext.Provider></QueryClientProvider>));
}
const button = (text: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === text)!;
const input = (name: string) => host.querySelector<HTMLInputElement>(`[id$="-${name}"]`)!;
async function submit() {
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

it('lets staff add a conflict company from Clearance and immediately shows the saved register entry', async () => {
  vi.mocked(accountsApi.create).mockImplementation(async () => {
    vi.mocked(accountsApi.list).mockResolvedValue(page([company]));
    return company;
  });
  await render();
  const user = userEvent.setup();
  await act(async () => { await user.click(button('Add conflict company')); });
  await act(async () => {
    await user.type(input('name'), ' Northstar Industries ');
    await user.type(input('aliases'), 'Blue Harbor');
    await user.type(input('description'), 'Adverse relationship');
  });
  await submit();
  expect(accountsApi.create).toHaveBeenCalledWith({ name: company.name, aliases: company.aliases, description: company.description, account_type: 'adverse_party', entity_kind: 'company' });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Conflict companies');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/dashboard/firmcrm/accounts/12');
  expect(host.textContent).toContain('Adverse relationship');
  expect(accountsApi.list).toHaveBeenCalledWith(expect.objectContaining({ account_type: 'adverse_party', include_archived: true }));
});

it('edits a saved company and searches the register by name or alias', async () => {
  vi.mocked(accountsApi.list).mockResolvedValue(page([{ ...company, is_archived: true }]));
  vi.mocked(accountsApi.update).mockResolvedValue({ ...company, aliases: null });
  await render();
  const user = userEvent.setup();
  await act(async () => { await user.click(button('Conflict companies')); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.textContent).toContain('Archived · still screened');
  await act(async () => { await user.click(button('Edit')); await user.clear(input('aliases')); });
  await submit();
  expect(accountsApi.update).toHaveBeenCalledWith(12, { name: company.name, aliases: null, description: company.description });
  await act(async () => { await user.type(host.querySelector('[aria-label="Search conflict companies"]')!, 'Blue Harbor'); });
  expect(accountsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Blue Harbor', offset: 0 }));
});

it('keeps the entered company when saving fails and explains how to handle an existing account', async () => {
  vi.mocked(accountsApi.create).mockRejectedValue(new ApiError(409, 'Duplicate', 'duplicate'));
  await render();
  const user = userEvent.setup();
  await act(async () => { await user.click(button('Add conflict company')); await user.type(input('name'), company.name); });
  await submit();
  expect(input('name').value).toBe(company.name);
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('set its Type to Adverse Party') }));
});

it('shows an explicit error instead of an empty screening list when loading fails', async () => {
  vi.mocked(accountsApi.list).mockRejectedValue(new Error('Unavailable'));
  await render();
  await act(async () => button('Conflict companies').click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load conflict companies');
  expect(host.textContent).not.toContain('No conflict companies yet');
});
