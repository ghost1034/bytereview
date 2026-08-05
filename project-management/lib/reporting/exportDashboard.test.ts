import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ html2canvas: vi.fn() }))

vi.mock('html2canvas', () => ({ default: mocks.html2canvas }))

import { exportDashboardPng } from './exportDashboard'

describe('exportDashboardPng', () => {
  beforeEach(() => {
    mocks.html2canvas.mockReset()
    vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: '#fff' }))
    vi.stubGlobal('document', {
      body: {},
      createElement: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts an html2canvas image error event into an actionable Error', async () => {
    mocks.html2canvas.mockRejectedValue(new Event('error'))

    await expect(exportDashboardPng({} as HTMLElement, 'dashboard.png')).rejects.toThrow(
      'The dashboard could not be exported. An image or other page asset may have failed to load.'
    )
  })
})
