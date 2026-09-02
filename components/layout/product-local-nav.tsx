'use client'

import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Calculator,
  Clock3,
  Droplet,
  FileText,
  GitMerge,
  Home,
  Laptop,
  LineChart,
  Plug,
  Search,
  Settings,
  Users,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

export interface ProductNavItem {
  label: string
  href: string
  icon: LucideIcon
  exact?: boolean
}

export const PRODUCT_LOCAL_NAV: Record<string, ProductNavItem[]> = {
  uda: [
    { label: 'Overview', href: '/dashboard/uda', icon: Home, exact: true },
    { label: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
    { label: 'Templates', href: '/dashboard/templates', icon: FileText },
    { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { label: 'Automations', href: '/dashboard/automations', icon: Zap },
  ],
  'analytics-suite': [
    { label: 'Overview', href: '/dashboard/analytics', icon: BarChart3, exact: true },
    { label: 'Clients', href: '/dashboard/analytics/clients', icon: Users },
    { label: 'Variance', href: '/dashboard/analytics/variance', icon: LineChart },
    { label: 'Reconciliation', href: '/dashboard/analytics/reconciliation', icon: GitMerge },
    { label: 'Fixed assets', href: '/dashboard/analytics/amortization', icon: Calculator },
    { label: 'Waterfall', href: '/dashboard/analytics/waterfall', icon: Droplet },
    { label: 'IRS Researcher', href: '/dashboard/analytics/research/irs', icon: Search },
    { label: 'GAAP Researcher', href: '/dashboard/analytics/research/gaap', icon: BookOpen },
    { label: 'Settings', href: '/dashboard/analytics/settings', icon: Settings },
  ],
  chrona: [
    { label: 'Dashboard', href: '/dashboard/analytics/chrona', icon: Clock3, exact: true },
    { label: 'Devices', href: '/dashboard/analytics/chrona/devices', icon: Laptop },
  ],
}

export function getProductLocalNavigation(productId?: string) {
  if (!productId) return []
  return PRODUCT_LOCAL_NAV[productId] ?? []
}

function isActive(pathname: string, item: ProductNavItem) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function ProductLocalNav({ productId }: { productId: string }) {
  const pathname = usePathname() ?? ''
  const items = getProductLocalNavigation(productId)
  if (!items.length) return null

  return (
    <div className="border-b border-border bg-background">
      <nav
        aria-label="Product navigation"
        className="mx-auto flex max-w-[96rem] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8"
      >
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
