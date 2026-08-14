import { describe, expect, it, vi } from 'vitest'

import {
  createDashboardModuleChromeRegistry,
  resolveDashboardCommandPalette,
  type DashboardModuleChrome,
} from '@/components/layout/dashboard-module-chrome'

describe('dashboard module chrome registry', () => {
  it('registers and updates store-backed breadcrumbs and action content', () => {
    const changes: Array<DashboardModuleChrome | null> = []
    const registry = createDashboardModuleChromeRegistry((chrome) => changes.push(chrome))
    const registration = registry.register({
      breadcrumbs: [{ label: 'Tasklytic' }, { label: 'Home' }],
      actions: 'Tasklytic actions',
    })

    registration.update({
      breadcrumbs: [{ label: 'Tasklytic' }, { label: 'Project alpha' }],
      actions: 'Updated Tasklytic actions',
    })

    expect(changes).toEqual([
      {
        breadcrumbs: [{ label: 'Tasklytic' }, { label: 'Home' }],
        actions: 'Tasklytic actions',
      },
      {
        breadcrumbs: [{ label: 'Tasklytic' }, { label: 'Project alpha' }],
        actions: 'Updated Tasklytic actions',
      },
    ])
  })

  it('cleans up the active module without letting stale routes clear a newer registration', () => {
    const changes: Array<DashboardModuleChrome | null> = []
    const registry = createDashboardModuleChromeRegistry((chrome) => changes.push(chrome))
    const first = registry.register({ breadcrumbs: [{ label: 'First' }] })
    const second = registry.register({ breadcrumbs: [{ label: 'Second' }] })

    first.unregister()
    expect(changes[changes.length - 1]?.breadcrumbs?.[0]?.label).toBe('Second')

    second.unregister()
    expect(changes[changes.length - 1]).toBeNull()
  })

  it('routes the shared command trigger to the module or global palette', () => {
    const openModule = vi.fn()
    const openGlobal = vi.fn()

    resolveDashboardCommandPalette({ openCommandPalette: openModule }, openGlobal)()
    expect(openModule).toHaveBeenCalledOnce()
    expect(openGlobal).not.toHaveBeenCalled()

    resolveDashboardCommandPalette(null, openGlobal)()
    expect(openGlobal).toHaveBeenCalledOnce()
  })
})
