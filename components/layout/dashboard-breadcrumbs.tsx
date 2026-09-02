'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getProductForPathname } from '@/lib/product-catalog'
import { cn } from '@/lib/utils'

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  uda: 'Overview',
  jobs: 'Jobs',
  templates: 'Templates',
  integrations: 'Integrations',
  automations: 'Automations',
  settings: 'Settings',
  'cpe-tracker': 'CPE Tracker',
  'form-fill': 'Form Fill',
  esign: 'E-Signature',
  inkwise: 'Inkwise',
  upload: 'Upload',
  fields: 'Fields',
  review: 'Review',
  processing: 'Processing',
  results: 'Results',
}

function humanize(segment: string) {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return null
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface Crumb {
  label: string
  href: string
  current: boolean
}

export function useBreadcrumbs(): Crumb[] {
  const pathname = usePathname() ?? '/dashboard'
  if (pathname === '/dashboard') {
    return [{ label: 'All products', href: '/dashboard', current: true }]
  }

  if (pathname === '/dashboard/settings') {
    return [
      { label: 'All products', href: '/dashboard', current: false },
      { label: 'Settings', href: pathname, current: true },
    ]
  }

  const product = getProductForPathname(pathname)
  if (!product) return []

  const isLegacyUdaRoute = product.id === 'uda' && !pathname.startsWith('/dashboard/uda')
  const routeBase = isLegacyUdaRoute ? '/dashboard' : product.appHref
  const relativePath = pathname.slice(routeBase.length).replace(/^\//, '')
  const segments = relativePath ? relativePath.split('/') : []
  const crumbs: Crumb[] = [{
    label: product.name,
    href: product.appHref,
    current: segments.length === 0,
  }]
  let acc = routeBase
  const routeCrumbs: Array<{ label: string; href: string }> = []
  segments.forEach((seg) => {
    acc += `/${seg}`
    const label = humanize(seg)
    if (!label) return
    routeCrumbs.push({ label, href: acc })
  })
  routeCrumbs.forEach((crumb, index) => {
    crumbs.push({ ...crumb, current: index === routeCrumbs.length - 1 })
  })
  if (segments.length > 0 && routeCrumbs.length === 0) crumbs[0].current = true
  return crumbs
}

interface DashboardBreadcrumbsProps {
  breadcrumbs?: Array<{ label: string; href?: string }>
  className?: string
}

export function DashboardBreadcrumbs({ breadcrumbs, className }: DashboardBreadcrumbsProps) {
  const routeCrumbs = useBreadcrumbs()
  const crumbs = breadcrumbs?.map((crumb, index) => ({
    ...crumb,
    current: index === breadcrumbs.length - 1,
  })) ?? routeCrumbs

  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <li key={`${crumb.label}-${crumb.href ?? i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden />
            )}
            {crumb.current || !crumb.href ? (
              <span
                aria-current={crumb.current ? 'page' : undefined}
                className={cn(
                  'truncate',
                  crumb.current ? 'font-medium text-foreground' : 'text-foreground-muted',
                )}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-foreground-muted transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
