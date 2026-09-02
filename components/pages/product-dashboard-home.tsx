'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Boxes } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useAnalyticsFirmOnboardingStatus } from '@/hooks/useAnalyticsTeam'
import { useBillingAccount } from '@/hooks/useBilling'
import { useCurrentUser } from '@/hooks/useUserProfile'
import { apiClient } from '@/lib/api'
import {
  PRODUCT_CATALOG,
  PRODUCT_GROUPS,
  type ProductCatalogItem,
} from '@/lib/product-catalog'
import {
  resolveProductAccessBadge,
  type ProductAccessContext,
  type ProductAccessSignal,
  type ProductAccessTone,
} from '@/lib/product-access'
import { cn } from '@/lib/utils'

const ACCESS_TONE_CLASSES: Record<ProductAccessTone, string> = {
  success: 'border-success/20 bg-success-soft text-success',
  info: 'border-primary/15 bg-primary-soft text-primary-soft-foreground',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  muted: 'border-border bg-surface-muted text-foreground-muted',
}

function ProductCard({
  product,
  access,
}: {
  product: ProductCatalogItem
  access: ProductAccessContext
}) {
  const Icon = product.icon
  const badge = resolveProductAccessBadge(product, access)

  return (
    <Link
      href={product.appHref}
      className={cn(
        'group relative min-h-56 overflow-hidden rounded-[1.75rem] border border-border bg-card p-6 shadow-sm',
        'transition duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface',
      )}
      aria-label={`Open ${product.name}`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 opacity-80 transition-opacity group-hover:opacity-100"
        style={{ backgroundImage: 'var(--product-holo)' }}
      />

      <article className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-2xl text-primary shadow-sm ring-1 ring-black/5"
            style={{ backgroundImage: 'var(--product-holo)' }}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <Badge
            variant="outline"
            className={cn('shrink-0 font-medium', ACCESS_TONE_CLASSES[badge.tone])}
          >
            {badge.label}
          </Badge>
        </div>

        <div className="mt-auto pt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold tracking-[-0.035em] text-foreground">
                {product.name}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-foreground-muted">
                {product.description}
              </p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight className="size-4" aria-hidden />
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}

function querySignal(
  value: { isLoading?: boolean; isPending?: boolean; isError: boolean; hasData: boolean },
  readySignal: ProductAccessSignal,
): ProductAccessSignal {
  if (value.isError) return 'error'
  if ((value.isLoading || value.isPending) && !value.hasData) return 'loading'
  return readySignal
}

export function ProductDashboardHome() {
  const { user } = useAuth()
  const { user: profile, isLoading: profileLoading } = useCurrentUser()
  const billing = useBillingAccount()
  const analytics = useAnalyticsFirmOnboardingStatus({ enabled: !!user })
  const activation = useQuery({
    queryKey: ['activation-status', user?.uid],
    queryFn: () => apiClient.getActivation(),
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  const paidPlanReady = Boolean(
    billing.data?.plan_code && billing.data.plan_code.trim().toLowerCase() !== 'free',
  )
  const access: ProductAccessContext = {
    paidPlan: querySignal(
      { ...billing, hasData: Boolean(billing.data) },
      paidPlanReady ? 'available' : 'upgrade',
    ),
    analytics: querySignal(
      { ...analytics, hasData: Boolean(analytics.data) },
      analytics.data?.needs_onboarding ? 'setup' : 'available',
    ),
    claw: querySignal(
      { ...activation, hasData: Boolean(activation.data) },
      activation.data?.has_key && !activation.data.revoked ? 'available' : 'setup',
    ),
  }

  const greetingName = profile?.display_name || profile?.email?.split('@')[0] || 'there'

  return (
    <div
      className="space-y-14 pb-12"
      style={{ '--product-holo': 'linear-gradient(110deg, #c9aaff 0%, #feffbc 27%, #ffcdfd 52%, #b3e2ff 76%, #839aff 100%)' } as CSSProperties}
    >
      <section className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-8 text-primary-foreground shadow-lg sm:px-9 sm:py-10 lg:px-12">
        <div
          aria-hidden
          className="absolute -right-20 -top-32 size-80 rounded-full opacity-25 blur-3xl"
          style={{ backgroundImage: 'var(--product-holo)' }}
        />
        <div className="relative max-w-3xl">
          <div className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary-foreground/65">
            <Boxes className="size-4" aria-hidden />
            CPAAutomation workspace
          </div>
          <h1 className="text-3xl font-medium tracking-[-0.05em] sm:text-4xl">
            {profileLoading ? 'Welcome back.' : `Welcome back, ${greetingName}.`}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/70 sm:text-base">
            Choose the product that fits the work in front of you. Every CPAAutomation workflow is available from this workspace.
          </p>
          <div className="mt-6 inline-flex items-center rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-1.5 text-xs font-medium text-primary-foreground/85">
            11 connected products
          </div>
        </div>
      </section>

      {PRODUCT_GROUPS.map((group) => {
        const products = PRODUCT_CATALOG.filter((product) => product.groupId === group.id)
        return (
          <section key={group.id} aria-labelledby={`${group.id}-heading`}>
            <div className="mb-6 grid gap-2 border-t border-border pt-5 sm:grid-cols-[4rem_1fr] sm:gap-4">
              <span className="font-mono text-xs text-foreground-subtle">{group.number}</span>
              <div>
                <h2
                  id={`${group.id}-heading`}
                  className="text-2xl font-medium tracking-[-0.04em] text-foreground sm:text-3xl"
                >
                  {group.name}
                </h2>
                <p className="mt-1 text-sm leading-6 text-foreground-muted">{group.description}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} access={access} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
