'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, BadgeCheck, Boxes, Sparkles } from 'lucide-react'

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

import styles from './product-dashboard-home.module.css'

const ACCESS_TONE_CLASSES: Record<ProductAccessTone, string> = {
  success: 'border-success/20 bg-success-soft text-success',
  info: 'border-primary/15 bg-primary-soft text-primary-soft-foreground',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  muted: 'border-border bg-surface-muted text-foreground-muted',
}

function ProductCard({
  product,
  access,
  index,
  groupNumber,
}: {
  product: ProductCatalogItem
  access: ProductAccessContext
  index: number
  groupNumber: string
}) {
  const Icon = product.icon
  const badge = resolveProductAccessBadge(product, access)

  return (
    <Link
      href={product.appHref}
      className={cn(
        'group',
        styles.productCard,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface',
      )}
      aria-label={`Open ${product.name}`}
    >
      <span aria-hidden className={styles.productCardGlow} />

      <article className={styles.productCardInner}>
        <div className={styles.productCardTopline}>
          <span className={styles.productNumber}>{groupNumber}.{String(index + 1).padStart(2, '0')}</span>
          <Badge
            variant="outline"
            className={cn('shrink-0 font-medium', ACCESS_TONE_CLASSES[badge.tone])}
          >
            {badge.label}
          </Badge>
        </div>

        <div className={styles.productIcon}>
          <Icon aria-hidden />
        </div>

        <div className={styles.productCardCopy}>
          <h3>{product.name}</h3>
          <p>{product.description}</p>
        </div>

        <div className={styles.productCardAction} aria-hidden>
          <span>Open product</span>
          <span className={styles.productArrow}>
            <ArrowUpRight />
          </span>
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
      className={styles.dashboard}
      style={{ '--product-holo': 'linear-gradient(110deg, #c9aaff 0%, #feffbc 27%, #ffcdfd 52%, #b3e2ff 76%, #839aff 100%)' } as CSSProperties}
    >
      <section className={styles.hero} aria-labelledby="workspace-heading">
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.heroPattern} aria-hidden />

        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}>
            <BadgeCheck aria-hidden />
            Your connected workspace
          </div>
          <h1 id="workspace-heading">
            {profileLoading ? 'Welcome back.' : `Welcome back, ${greetingName}.`}
          </h1>
          <p>
            Everything your team needs to move from source documents to finished,
            review-ready work—together in one place.
          </p>

          <div className={styles.heroActions}>
            <a href="#product-workspace" className={styles.primaryAction}>
              Explore products
              <span><ArrowRight aria-hidden /></span>
            </a>
            <span className={styles.heroMeta}>
              <Sparkles aria-hidden />
              11 purpose-built products
            </span>
          </div>
        </div>

        <nav className={styles.workspaceIndex} aria-label="Product categories">
          <div className={styles.workspaceIndexHeader}>
            <span><Boxes aria-hidden /> Product index</span>
            <span>04 areas</span>
          </div>
          <div className={styles.workspaceIndexList}>
            {PRODUCT_GROUPS.map((group) => {
              const productCount = PRODUCT_CATALOG.filter((product) => product.groupId === group.id).length
              return (
                <a key={group.id} href={`#${group.id}-heading`}>
                  <span>{group.number}</span>
                  <strong>{group.name}</strong>
                  <small>{productCount}</small>
                  <ArrowUpRight aria-hidden />
                </a>
              )
            })}
          </div>
        </nav>
      </section>

      <div id="product-workspace" className={styles.catalogIntro}>
        <p><span>Workspace</span> / All products</p>
        <p>Choose the right tool for the work in front of you.</p>
      </div>

      {PRODUCT_GROUPS.map((group) => {
        const products = PRODUCT_CATALOG.filter((product) => product.groupId === group.id)
        return (
          <section key={group.id} aria-labelledby={`${group.id}-heading`} className={styles.productGroup}>
            <div className={styles.groupHeader}>
              <span>{group.number}</span>
              <div className={styles.groupHeadingCopy}>
                <h2
                  id={`${group.id}-heading`}
                >
                  {group.name}
                </h2>
                <p>{group.description}</p>
              </div>
              <span className={styles.groupCount}>{String(products.length).padStart(2, '0')} products</span>
            </div>
            <div className={styles.productGrid}>
              {products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  access={access}
                  index={index}
                  groupNumber={group.number}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
