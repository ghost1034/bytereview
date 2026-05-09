'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  jobs: 'Jobs',
  templates: 'Templates',
  integrations: 'Integrations',
  automations: 'Automations',
  settings: 'Settings',
  'cpe-tracker': 'CPE Tracker',
  'form-fill': 'Form Fill',
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
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: Crumb[] = []
  let acc = ''
  segments.forEach((seg, i) => {
    acc += `/${seg}`
    const label = humanize(seg)
    if (!label) return
    crumbs.push({ label, href: acc, current: i === segments.length - 1 })
  })
  return crumbs
}

interface DashboardBreadcrumbsProps {
  className?: string
}

export function DashboardBreadcrumbs({ className }: DashboardBreadcrumbsProps) {
  const crumbs = useBreadcrumbs()

  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden />
            )}
            {crumb.current ? (
              <span
                aria-current="page"
                className="truncate font-medium text-foreground"
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
