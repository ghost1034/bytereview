import { describe, expect, it } from 'vitest'

import type { SubscriptionPlan } from '@/hooks/useBilling'
import {
  buildClawCommands,
  clawProducts,
  demoVideos,
  formatAutomationLimit,
  formatLimit,
  presentPlan,
  productLinks,
  protectedDestinations,
} from './config'

const plan = (overrides: Partial<SubscriptionPlan>): SubscriptionPlan => ({
  code: 'free', display_name: 'Free', pages_included: 100, tokens_included: 1000,
  automations_limit: 1, overage_cents: 0, token_overage_cents: 0, sort_order: 0,
  ...overrides,
})

describe('marketing configuration', () => {
  it('retains every protected product destination', () => {
    expect(protectedDestinations).toEqual({
      formFill: '/dashboard/form-fill', inkwise: '/dashboard/inkwise',
      tasklytic: '/dashboard/project-management', pbc: '/dashboard/pbc',
      esign: '/dashboard/esign', analytics: '/dashboard/analytics',
    })
  })

  it('maps product navigation and exact video destinations', () => {
    expect(productLinks).toHaveLength(10)
    expect(demoVideos).toHaveLength(18)
    expect(demoVideos.every((video) => video.url.startsWith('https://www.youtube-nocookie.com/embed/'))).toBe(true)
  })

  it('formats singular, plural, and unlimited limits', () => {
    expect(formatLimit(1, 'page')).toBe('1 page per month')
    expect(formatLimit(500, 'page')).toBe('500 pages per month')
    expect(formatLimit(-1, 'page')).toBe('Unlimited pages per month')
    expect(formatAutomationLimit(1)).toBe('Up to 1 automation')
  })

  it('uses fixed known-plan copy and no invented unknown-plan price', () => {
    expect(presentPlan(plan({ code: 'pro', display_name: 'Whatever' }))).toMatchObject({ name: 'Pro', price: '$49.99/month' })
    expect(presentPlan(plan({ code: 'enterprise', display_name: 'Enterprise Plus' }))).toEqual({ name: 'Enterprise Plus', description: 'Flexible plan', price: null })
  })

  it('generates distinct Claw commands and documented fallbacks', () => {
    const accounting = clawProducts.find((product) => product.id === 'accounting')!
    const legal = clawProducts.find((product) => product.id === 'legal')!
    expect(accounting.image).toBeTruthy()
    expect(legal.image).toBeTruthy()
    expect(buildClawCommands(accounting).run).toContain('127.0.0.1:8642:8642')
    expect(buildClawCommands(legal).run).toContain('127.0.0.1:8643:8642')
    expect(buildClawCommands(legal).desktopUnix).toContain('install-legalclaw.sh')
  })
})
