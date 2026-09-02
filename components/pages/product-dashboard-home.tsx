'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Boxes } from 'lucide-react'

import { useCurrentUser } from '@/hooks/useUserProfile'
import {
  PRODUCT_CATALOG,
  PRODUCT_GROUPS,
  type ProductCatalogItem,
} from '@/lib/product-catalog'
import { cn } from '@/lib/utils'

import styles from './product-dashboard-home.module.css'

function ProductCard({
  product,
}: {
  product: ProductCatalogItem
}) {
  const Icon = product.icon

  return (
    <Link
      href={product.appHref}
      className={cn(
        'group',
        styles.productCard,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface',
      )}
      aria-label={`Go to ${product.name}`}
    >
      <span aria-hidden className={styles.productCardGlow} />

      <article className={styles.productCardInner}>
        <div className={styles.productIcon}>
          <Icon aria-hidden />
        </div>

        <div className={styles.productCardCopy}>
          <h3>{product.name}</h3>
          <p>{product.description}</p>
        </div>

        <div className={styles.productCardAction} aria-hidden>
          <span className={styles.productArrow}>
            <ArrowUpRight />
          </span>
        </div>
      </article>
    </Link>
  )
}

export function ProductDashboardHome() {
  const { user: profile, isLoading: profileLoading } = useCurrentUser()

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
          <h1 id="workspace-heading">
            {profileLoading ? 'Welcome back.' : `Welcome back, ${greetingName}.`}
          </h1>

          <div className={styles.heroActions}>
            <a href="#product-workspace" className={styles.primaryAction}>
              Explore products
              <span><ArrowRight aria-hidden /></span>
            </a>
          </div>
        </div>

        <nav className={styles.workspaceIndex} aria-label="Product categories">
          <div className={styles.workspaceIndexHeader}>
            <span><Boxes aria-hidden /> Product index</span>
          </div>
          <div className={styles.workspaceIndexList}>
            {PRODUCT_GROUPS.map((group) => (
              <a key={group.id} href={`#${group.id}-heading`}>
                <strong>{group.name}</strong>
                <ArrowUpRight aria-hidden />
              </a>
            ))}
          </div>
        </nav>
      </section>

      {PRODUCT_GROUPS.map((group, groupIndex) => {
        const products = PRODUCT_CATALOG.filter((product) => product.groupId === group.id)
        return (
          <section
            key={group.id}
            id={groupIndex === 0 ? 'product-workspace' : undefined}
            aria-labelledby={`${group.id}-heading`}
            className={styles.productGroup}
          >
            <div className={styles.groupHeader}>
              <div className={styles.groupHeadingCopy}>
                <h2
                  id={`${group.id}-heading`}
                >
                  {group.name}
                </h2>
                <p>{group.description}</p>
              </div>
            </div>
            <div className={styles.productGrid}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
