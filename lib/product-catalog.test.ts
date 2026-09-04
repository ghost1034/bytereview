import { describe, expect, it } from 'vitest'

import { PRODUCTS } from '@/components/public-site/content'
import { PRODUCT_LOCAL_NAV } from '@/components/layout/product-local-nav'
import {
  getProductForPathname,
  isImmersiveDashboardPath,
  PRODUCT_CATALOG,
  PRODUCT_GROUPS,
} from '@/lib/product-catalog'
import { resolveProductAccessBadge, type ProductAccessContext } from '@/lib/product-access'

const AVAILABLE_CONTEXT: ProductAccessContext = {
  paidPlan: 'available',
  analytics: 'available',
  claw: 'available',
}

describe('CPAAutomation product catalog', () => {
  it('defines exactly twelve unique products across four populated groups', () => {
    expect(PRODUCT_CATALOG).toHaveLength(12)
    expect(PRODUCT_GROUPS).toHaveLength(4)
    expect(new Set(PRODUCT_CATALOG.map((product) => product.id)).size).toBe(12)
    expect(new Set(PRODUCT_CATALOG.map((product) => product.name)).size).toBe(12)
    expect(new Set(PRODUCT_CATALOG.map((product) => product.appHref)).size).toBe(12)
    expect(PRODUCT_GROUPS.every((group) => (
      PRODUCT_CATALOG.some((product) => product.groupId === group.id)
    ))).toBe(true)
  })

  it('keeps the public and authenticated catalogs synchronized', () => {
    expect(PRODUCTS.map((product) => ({
      name: product.name,
      description: product.description,
      href: product.href,
    }))).toEqual(PRODUCT_CATALOG.map((product) => ({
      name: product.name,
      description: product.description,
      href: product.marketingHref,
    })))
  })

  it.each([
    ['/dashboard/firmcrm/accounts/1', 'firmcrm'],
    ['/dashboard/uda', 'uda'],
    ['/dashboard/jobs/abc/results', 'uda'],
    ['/dashboard/form-fill', 'form-fill'],
    ['/dashboard/pbc/engagements/abc', 'pbc'],
    ['/dashboard/inkwise/write/abc', 'inkwise'],
    ['/dashboard/esign/abc/documents', 'esign'],
    ['/dashboard/project-management/w/abc', 'tasklytic'],
    ['/dashboard/analytics/chrona/devices', 'chrona'],
    ['/dashboard/analytics/variance', 'analytics-suite'],
    ['/dashboard/taxatlas/map', 'taxatlas'],
    ['/dashboard/activation', 'claw-series'],
    ['/dashboard/cpe-tracker', 'cpe-tracker'],
  ])('resolves %s to %s', (pathname, productId) => {
    expect(getProductForPathname(pathname)?.id).toBe(productId)
  })

  it('keeps platform routes outside product scopes', () => {
    expect(getProductForPathname('/dashboard')).toBeNull()
    expect(getProductForPathname('/dashboard/settings')).toBeNull()
  })

  it('scopes local navigation to UDA, Analytics, and Chrona', () => {
    expect(PRODUCT_LOCAL_NAV.uda.map((item) => item.label)).toEqual([
      'Overview', 'Jobs', 'Templates', 'Integrations', 'Automations',
    ])
    expect(PRODUCT_LOCAL_NAV['analytics-suite'].some((item) => item.href.includes('/chrona'))).toBe(false)
    expect(PRODUCT_LOCAL_NAV.chrona.map((item) => item.label)).toEqual(['Dashboard', 'Devices'])
    expect(PRODUCT_LOCAL_NAV.uda.some((item) => item.href === '/dashboard/settings')).toBe(false)
  })

  it('recognizes distraction-free E-Signature routes without hiding normal pages', () => {
    expect(isImmersiveDashboardPath('/dashboard/esign/abc/fields')).toBe(true)
    expect(isImmersiveDashboardPath('/dashboard/esign/templates/abc')).toBe(true)
    expect(isImmersiveDashboardPath('/dashboard/esign')).toBe(false)
  })
})

describe('product access badges', () => {
  const product = (id: string) => PRODUCT_CATALOG.find((item) => item.id === id)!

  it('uses stable labels for free and ungated products', () => {
    expect(resolveProductAccessBadge(product('cpe-tracker'), AVAILABLE_CONTEXT).label).toBe('Free')
    expect(resolveProductAccessBadge(product('uda'), AVAILABLE_CONTEXT).label).toBe('Available')
    expect(resolveProductAccessBadge(product('firmcrm'), { ...AVAILABLE_CONTEXT, analytics: 'upgrade', paidPlan: 'upgrade' }).label).toBe('Available')
  })

  it('reflects plan, setup, loading, and error states without changing destinations', () => {
    expect(resolveProductAccessBadge(product('tasklytic'), { ...AVAILABLE_CONTEXT, paidPlan: 'upgrade' }).label).toBe('Paid')
    expect(resolveProductAccessBadge(product('analytics-suite'), { ...AVAILABLE_CONTEXT, analytics: 'setup' }).label).toBe('Setup required')
    expect(resolveProductAccessBadge(product('claw-series'), AVAILABLE_CONTEXT).label).toBe('Activated')
    expect(resolveProductAccessBadge(product('claw-series'), { ...AVAILABLE_CONTEXT, claw: 'loading' }).label).toBe('Checking')
    expect(resolveProductAccessBadge(product('claw-series'), { ...AVAILABLE_CONTEXT, claw: 'error' }).label).toBe('Access unknown')
  })
})
