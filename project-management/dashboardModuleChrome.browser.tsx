import { useCallback, useMemo, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import {
  DashboardModuleChromeProvider,
  useDashboardModuleChrome,
  useRegisteredDashboardModuleChrome,
} from '@/components/layout/dashboard-module-chrome'
import { usePageMeta } from './hooks/usePageMeta'
import { useUiStore } from './stores/auth'

function ModuleRegistration({ label, onOpen }: { label: string; onOpen: () => void }) {
  const chrome = useMemo(
    () => ({
      breadcrumbs: [{ label: 'Tasklytic' }, { label }],
      openCommandPalette: onOpen,
      actions: <button type="button">Create in Tasklytic</button>,
    }),
    [label, onOpen],
  )
  useDashboardModuleChrome(chrome)
  return null
}

function ModuleChromeHarness() {
  const [mounted, setMounted] = useState(true)
  const [label, setLabel] = useState('Home')
  const [openCount, setOpenCount] = useState(0)
  const chrome = useRegisteredDashboardModuleChrome()
  const openPalette = useCallback(() => setOpenCount((count) => count + 1), [])

  return (
    <>
      {mounted ? (
        <ModuleRegistration label={label} onOpen={openPalette} />
      ) : null}
      <output aria-label="Registered breadcrumb">
        {chrome?.breadcrumbs?.[chrome.breadcrumbs.length - 1]?.label ?? 'Global fallback'}
      </output>
      <output aria-label="Module palette opens">{openCount}</output>
      {chrome?.actions}
      <button type="button" onClick={chrome?.openCommandPalette}>Open registered palette</button>
      <button type="button" onClick={() => setLabel('Project alpha')}>Change page</button>
      <button type="button" onClick={() => setMounted(false)}>Leave module</button>
    </>
  )
}

function PageMetaRegistration({ label }: { label: string }) {
  usePageMeta({ breadcrumbs: [{ label: 'Tasklytic' }, { label }] })
  return null
}

function PageMetaHarness() {
  const [mounted, setMounted] = useState(true)
  const [label, setLabel] = useState('Home')
  const breadcrumbs = useUiStore((state) => state.breadcrumbs)

  return (
    <>
      {mounted ? <PageMetaRegistration label={label} /> : null}
      <output aria-label="Store breadcrumb">
        {breadcrumbs[breadcrumbs.length - 1]?.label ?? 'No breadcrumb'}
      </output>
      <button type="button" onClick={() => setLabel('Inbox')}>Open Inbox</button>
      <button type="button" onClick={() => setMounted(false)}>Unmount page metadata</button>
    </>
  )
}

describe('dashboard module chrome hook', () => {
  beforeEach(() => {
    useUiStore.setState({ breadcrumbs: [] })
  })

  it('updates module content and cleans it up when the route module unmounts', async () => {
    const screen = render(
      <DashboardModuleChromeProvider>
        <ModuleChromeHarness />
      </DashboardModuleChromeProvider>,
    )

    await expect.element(screen.getByLabelText('Registered breadcrumb')).toHaveTextContent('Home')
    await expect.element(screen.getByRole('button', { name: 'Create in Tasklytic' })).toBeVisible()

    await screen.getByRole('button', { name: 'Open registered palette' }).click()
    await expect.element(screen.getByLabelText('Module palette opens')).toHaveTextContent('1')

    await screen.getByRole('button', { name: 'Change page' }).click()
    await expect.element(screen.getByLabelText('Registered breadcrumb')).toHaveTextContent('Project alpha')

    await screen.getByRole('button', { name: 'Leave module' }).click()
    await expect.element(screen.getByLabelText('Registered breadcrumb')).toHaveTextContent('Global fallback')
    await expect.element(screen.getByRole('button', { name: 'Create in Tasklytic' })).not.toBeInTheDocument()
  })

  it('keeps Tasklytic page metadata dynamic and clears it on page cleanup', async () => {
    const screen = render(<PageMetaHarness />)

    await expect.element(screen.getByLabelText('Store breadcrumb')).toHaveTextContent('Home')
    await screen.getByRole('button', { name: 'Open Inbox' }).click()
    await expect.element(screen.getByLabelText('Store breadcrumb')).toHaveTextContent('Inbox')
    await screen.getByRole('button', { name: 'Unmount page metadata' }).click()
    await expect.element(screen.getByLabelText('Store breadcrumb')).toHaveTextContent('No breadcrumb')
  })
})
