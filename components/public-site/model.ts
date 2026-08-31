import type { DocsTree } from '@/lib/docs/navigation'

export interface PublicPricingPlan {
  code: string
  pages_included: number
  tokens_included: number
  pbc_storage_bytes_included: number
  automations_limit: number
}

export type PublicPricingState = 'loading' | 'error' | 'empty' | 'ready'

export function getPublicPricingState({
  isLoading,
  isError,
  planCount,
}: {
  isLoading: boolean
  isError: boolean
  planCount: number
}): PublicPricingState {
  if (isLoading) return 'loading'
  if (isError) return 'error'
  return planCount === 0 ? 'empty' : 'ready'
}

export function getPublicPlanPrice(code: string) {
  if (code === 'basic') return '$9.99'
  if (code === 'pro') return '$49.99'
  return 'Free'
}

export function getPublicPlanFeatures(plan: PublicPricingPlan) {
  const storage = plan.pbc_storage_bytes_included >= 1024 * 1024 * 1024
    ? '1 GB PBC storage'
    : `${plan.pbc_storage_bytes_included / (1024 * 1024)} MB PBC storage`

  return [
    `${plan.pages_included === 999999 ? 'Unlimited' : plan.pages_included.toLocaleString()} pages per month`,
    `${plan.tokens_included.toLocaleString()} platform AI tokens`,
    storage,
    `Up to ${plan.automations_limit} automations`,
    'Custom extraction templates',
    'CSV, Excel, and Google Sheets exports',
    plan.code === 'pro' ? 'Priority support and API access' : 'Standard support',
  ]
}

export function searchPublicDocs(sections: DocsTree, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  return sections
    .flatMap((section) => section.pages.map((page) => ({ section, page })))
    .filter(({ section, page }) => (
      `${section.title} ${page.title} ${page.description ?? ''}`
        .toLowerCase()
        .includes(normalized)
    ))
    .slice(0, 8)
}
