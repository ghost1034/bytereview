import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from '@vitest/browser/context'
import { render } from 'vitest-browser-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/app/globals.css'

const state = vi.hoisted(() => ({
  account: { plan_code: 'free', feedback_reward_available_at: null as string | null },
  request: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@/hooks/useBilling', () => ({
  useBillingAccount: () => ({ data: state.account }),
  useInvalidateBillingQueries: () => state.invalidate,
}))
vi.mock('@/lib/api', () => ({ apiClient: { request: state.request } }))

import { FeedbackButton } from './FeedbackButton'

async function openFeedback() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const screen = render(<QueryClientProvider client={client}><FeedbackButton /></QueryClientProvider>)
  await screen.getByRole('button', { name: 'Give feedback' }).click()
  return screen
}

describe('FeedbackButton', () => {
  beforeEach(async () => {
    await page.viewport(1280, 800)
    document.body.className = 'font-sans antialiased'
    // Next.js supplies this font variable in the application layout.
    document.documentElement.style.setProperty('--font-instrument-sans', 'Arial')
    vi.clearAllMocks()
    state.account = { plan_code: 'free', feedback_reward_available_at: null }
  })

  it('shows the free reward, validates input, and confirms Basic activation', async () => {
    const screen = await openFeedback()
    await expect.element(screen.getByText(/No payment method required/)).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Submit feedback' })).toBeDisabled()
    await screen.getByLabelText('Your feedback').fill('Please make uploading files easier.')
    await page.screenshot({ path: '../../tmp/cpa-feedback-desktop.png' })
    state.request.mockResolvedValue({ reward: 'basic_month', basic_until: '2026-10-07T12:00:00Z' })
    await screen.getByRole('button', { name: 'Submit feedback' }).click()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Basic is now free until')
    expect(state.invalidate).toHaveBeenCalledOnce()
    expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({
      message: 'Please make uploading files easier.', request_id: expect.any(String),
    })
  })

  it('keeps the draft and request ID on failure and prevents duplicate pending submits', async () => {
    state.account.plan_code = 'pro'
    const screen = await openFeedback()
    await expect.element(screen.getByText(/Storage stays unchanged/)).toBeVisible()
    await screen.getByLabelText('Your feedback').fill('Improve the export workflow.')
    let reject: (reason: Error) => void = () => {}
    state.request.mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    await screen.getByRole('button', { name: 'Submit feedback' }).click()
    await expect.element(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    reject(new Error('Connection failed. Please try again.'))
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Connection failed')
    await expect.element(screen.getByLabelText('Your feedback')).toHaveValue('Improve the export workflow.')
    state.request.mockResolvedValue({ reward: 'usage_reset' })
    await screen.getByRole('button', { name: 'Submit feedback' }).click()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Storage is unchanged')
    expect(JSON.parse(state.request.mock.calls[0][1].body).request_id)
      .toBe(JSON.parse(state.request.mock.calls[1][1].body).request_id)
  })

  it('explains the monthly limit and fits a mobile viewport', async () => {
    state.account.feedback_reward_available_at = '2099-10-07T12:00:00Z'
    await page.viewport(390, 844)
    const screen = await openFeedback()
    await expect.element(screen.getByText(/You have earned this month's reward/)).toBeVisible()
    await screen.getByLabelText('Your feedback').fill('One more suggestion.')
    await page.screenshot({ path: '../../tmp/cpa-feedback-mobile.png' })
    const dialog = screen.getByRole('dialog').element().getBoundingClientRect()
    expect(dialog.left).toBeGreaterThanOrEqual(0)
    expect(dialog.right).toBeLessThanOrEqual(390)
    state.request.mockResolvedValue({ reward: 'none', next_reward_at: '2099-10-07T12:00:00Z' })
    await screen.getByRole('button', { name: 'Submit feedback' }).click()
    await expect.element(screen.getByRole('status')).toHaveTextContent('already earned')
    await page.viewport(1280, 720)
  })
})
