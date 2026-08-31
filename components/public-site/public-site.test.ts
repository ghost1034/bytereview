import { describe, expect, it } from 'vitest'

import type { DocsTree } from '@/lib/docs/navigation'
import {
  isPublicSitePath,
  NAV_ITEMS,
  PRODUCTS,
} from './content'
import {
  getPublicPlanFeatures,
  getPublicPlanPrice,
  getPublicPricingState,
  searchPublicDocs,
} from './model'

describe('public-site route boundaries', () => {
  it('includes every redesigned route and nested docs pages', () => {
    const routes = [
      '/',
      '/demo',
      '/consulting',
      '/consulting/llm-governance',
      '/pricing',
      '/docs',
      '/docs/chrona/overview',
      '/about',
      '/contact',
      '/features',
      '/claw',
      '/case-study/LFO',
      '/privacy',
      '/terms',
    ]

    expect(routes.every(isPublicSitePath)).toBe(true)
  })

  it('keeps transactional and lookalike routes out of the redesign', () => {
    expect(isPublicSitePath('/dashboard')).toBe(false)
    expect(isPublicSitePath('/complete-signin')).toBe(false)
    expect(isPublicSitePath('/contact-import')).toBe(false)
  })

  it('keeps navigation numbers, routes, and product names unique', () => {
    expect(new Set(NAV_ITEMS.map((item) => item.number)).size).toBe(NAV_ITEMS.length)
    expect(new Set(NAV_ITEMS.map((item) => item.href)).size).toBe(NAV_ITEMS.length)
    expect(new Set(PRODUCTS.map((product) => product.name)).size).toBe(PRODUCTS.length)
    expect(PRODUCTS).toHaveLength(11)
  })
})

describe('public-site dynamic states', () => {
  it('resolves pricing loading, error, empty, and ready states', () => {
    expect(getPublicPricingState({ isLoading: true, isError: false, planCount: 0 })).toBe('loading')
    expect(getPublicPricingState({ isLoading: false, isError: true, planCount: 0 })).toBe('error')
    expect(getPublicPricingState({ isLoading: false, isError: false, planCount: 0 })).toBe('empty')
    expect(getPublicPricingState({ isLoading: false, isError: false, planCount: 3 })).toBe('ready')
  })

  it('formats live plan data without using template prices', () => {
    expect(getPublicPlanPrice('free')).toBe('Free')
    expect(getPublicPlanPrice('basic')).toBe('$9.99')
    expect(getPublicPlanPrice('pro')).toBe('$49.99')
    expect(getPublicPlanFeatures({ code: 'pro', pages_included: 999999, tokens_included: 50000, pbc_storage_bytes_included: 1073741824, automations_limit: 25 }))
      .toContain('Unlimited pages per month')
  })
})

describe('public documentation search', () => {
  const sections: DocsTree = [{
    slug: 'chrona',
    title: 'Chrona',
    description: 'Time reconstruction',
    pages: [
      { slug: 'overview', title: 'Overview', description: 'Reconstruct time automatically' },
      { slug: 'pairing', title: 'Pairing', description: 'Connect a desktop device' },
    ],
  }]

  it('matches titles and descriptions case-insensitively', () => {
    expect(searchPublicDocs(sections, 'DESKTOP')[0]?.page.slug).toBe('pairing')
    expect(searchPublicDocs(sections, 'chrona')).toHaveLength(2)
  })

  it('does not return results for a blank query', () => {
    expect(searchPublicDocs(sections, '  ')).toEqual([])
  })
})
