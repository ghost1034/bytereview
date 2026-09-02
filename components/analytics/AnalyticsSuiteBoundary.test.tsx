// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigationState = vi.hoisted(() => ({ pathname: '/dashboard/analytics' }))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}))
vi.mock('./AIAssistant', () => ({
  AIAssistant: () => <div data-ai-assistant />,
}))
vi.mock('./AnalyticsFirmGate', () => ({
  AnalyticsFirmGate: ({ children }: { children: ReactNode }) => (
    <div data-analytics-firm-gate>{children}</div>
  ),
}))

import { AnalyticsSuiteBoundary } from './AnalyticsSuiteBoundary'

describe('AnalyticsSuiteBoundary', () => {
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
    navigationState.pathname = '/dashboard/analytics'
  })

  it('does not send Chrona routes through AI Analytics setup', async () => {
    navigationState.pathname = '/dashboard/analytics/chrona/devices'

    await act(async () => root.render(
      <AnalyticsSuiteBoundary><div data-chrona-page /></AnalyticsSuiteBoundary>,
    ))

    expect(host.querySelector('[data-chrona-page]')).not.toBeNull()
    expect(host.querySelector('[data-analytics-firm-gate]')).toBeNull()
    expect(host.querySelector('[data-ai-assistant]')).toBeNull()
  })

  it('continues to gate AI Analytics Suite routes', async () => {
    navigationState.pathname = '/dashboard/analytics/variance'

    await act(async () => root.render(
      <AnalyticsSuiteBoundary><div data-analytics-page /></AnalyticsSuiteBoundary>,
    ))

    expect(host.querySelector('[data-analytics-firm-gate]')).not.toBeNull()
    expect(host.querySelector('[data-ai-assistant]')).not.toBeNull()
  })
})
