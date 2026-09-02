import type { ProductCatalogItem } from '@/lib/product-catalog'

export type ProductAccessSignal = 'available' | 'upgrade' | 'setup' | 'loading' | 'error'

export interface ProductAccessContext {
  paidPlan: ProductAccessSignal
  analytics: ProductAccessSignal
  claw: ProductAccessSignal
}

export type ProductAccessTone = 'success' | 'info' | 'warning' | 'muted'

export interface ProductAccessBadge {
  label: string
  tone: ProductAccessTone
}

export function resolveProductAccessBadge(
  product: ProductCatalogItem,
  context: ProductAccessContext,
): ProductAccessBadge {
  if (product.accessStrategy === 'free') {
    return { label: 'Free', tone: 'success' }
  }

  if (product.accessStrategy === 'available') {
    return { label: 'Available', tone: 'success' }
  }

  const signal = product.accessStrategy === 'paid-plan'
    ? context.paidPlan
    : product.accessStrategy === 'analytics-setup'
      ? context.analytics
      : context.claw

  if (signal === 'loading') return { label: 'Checking', tone: 'muted' }
  if (signal === 'error') return { label: 'Access unknown', tone: 'muted' }
  if (signal === 'upgrade') return { label: 'Paid', tone: 'info' }
  if (signal === 'setup') return { label: 'Setup required', tone: 'warning' }

  return {
    label: product.accessStrategy === 'claw-activation' ? 'Activated' : 'Available',
    tone: 'success',
  }
}
