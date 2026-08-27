'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Calculator,
  Clock,
  ClipboardCheck,
  Droplet,
  Files,
  FileSignature,
  FileText,
  FolderKanban,
  GitMerge,
  GraduationCap,
  Home,
  KeyRound,
  LineChart,
  MonitorSmartphone,
  PenTool,
  Plug,
  Search,
  Settings as SettingsIcon,
  Timer,
  Users,
  Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  badgeTone?: 'success' | 'muted'
}

interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

const UDA_GROUP: NavGroup = {
  key: 'uda',
  label: 'Universal Document Analysis',
  items: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
    { name: 'Templates', href: '/dashboard/templates', icon: FileText },
    { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { name: 'Automations', href: '/dashboard/automations', icon: Zap },
    { name: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
  ],
}

const PRODUCTS_GROUP: NavGroup = {
  key: 'products',
  label: 'Products',
  items: [
    {
      name: 'CPE Tracker',
      href: '/dashboard/cpe-tracker',
      icon: GraduationCap,
      badge: 'Free',
      badgeTone: 'success',
    },
    { name: 'Form Fill', href: '/dashboard/form-fill', icon: Files },
    { name: 'PBC', href: '/dashboard/pbc', icon: ClipboardCheck },
    { name: 'Inkwise', href: '/dashboard/inkwise', icon: PenTool },
    {
      name: 'Tasklytic',
      href: '/dashboard/project-management',
      icon: FolderKanban,
      badge: 'Paid',
      badgeTone: 'muted',
    },
    { name: 'E-Signature', href: '/dashboard/esign', icon: FileSignature },
  ],
}

const PRIVATE_DEPLOYMENT_GROUP: NavGroup = {
  key: 'private-deployment',
  label: 'Private Deployment',
  items: [
    { name: 'Chrona', href: '/#chrona-showcase', icon: Timer },
    { name: 'Time Tracking', href: '/dashboard/analytics/chrona', icon: Clock },
    { name: 'Chrona Devices', href: '/dashboard/analytics/chrona/devices', icon: MonitorSmartphone },
    { name: 'Claw Series', href: '/claw', icon: Bot },
    { name: 'Claw Activation', href: '/dashboard/activation', icon: KeyRound },
  ],
}

const ANALYTICS_GROUP: NavGroup = {
  key: 'analytics',
  label: 'Analytics',
  items: [
    { name: 'Clients', href: '/dashboard/analytics/clients', icon: Users },
    { name: 'Dashboard', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Variance', href: '/dashboard/analytics/variance', icon: LineChart },
    { name: 'Reconciliation', href: '/dashboard/analytics/reconciliation', icon: GitMerge },
    { name: 'Fixed Assets', href: '/dashboard/analytics/amortization', icon: Calculator },
    { name: 'Waterfall', href: '/dashboard/analytics/waterfall', icon: Droplet },
    { name: 'IRS Researcher', href: '/dashboard/analytics/research/irs', icon: Search },
    { name: 'GAAP Researcher', href: '/dashboard/analytics/research/gaap', icon: BookOpen },
    { name: 'Settings', href: '/dashboard/analytics/settings', icon: SettingsIcon },
  ],
}

function isActiveHref(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/dashboard/analytics') return pathname === '/dashboard/analytics'
  if (href === '/dashboard/analytics/chrona') {
    // Device detail pages belong to Time Tracking; /devices is its own entry.
    return (
      pathname === href ||
      (pathname.startsWith(`${href}/`) && !pathname.startsWith(`${href}/devices`))
    )
  }
  if (href.startsWith('/#')) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavGroupBlock({ group }: { group: NavGroup }) {
  const pathname = usePathname() ?? ''
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
            const Icon = item.icon
            const active = isActiveHref(pathname, item.href)
            return (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.name}
                >
                  <Link href={item.href}>
                    <Icon />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && (
                  <SidebarMenuBadge
                    className={cn(
                      'tabular-nums',
                      item.badgeTone === 'success' &&
                        'bg-success-soft text-success',
                      item.badgeTone === 'muted' &&
                        'bg-surface-muted text-foreground-subtle',
                    )}
                  >
                    {item.badge}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  return (
    <Sidebar
      collapsible="icon"
      className="dashboard-sidebar-shell border-r border-sidebar-border"
    >
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <Link
          href="/"
          aria-label="CPAAutomation home"
          className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-md"
        >
          {/* Expanded: full wordmark logo */}
          <Image
            src="/logo.png"
            alt="CPAAutomation"
            width={240}
            height={80}
            priority
            className="h-9 w-auto group-data-[collapsible=icon]:hidden"
          />
          {/* Collapsed: cropped to the leftmost mark so it fits the icon rail */}
          <span className="hidden size-8 shrink-0 overflow-hidden rounded-md group-data-[collapsible=icon]:flex">
            <Image
              src="/logo.png"
              alt=""
              width={240}
              height={80}
              className="h-8 w-auto max-w-none object-cover object-left"
            />
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <NavGroupBlock group={UDA_GROUP} />
        <SidebarSeparator />
        <NavGroupBlock group={PRODUCTS_GROUP} />
        <SidebarSeparator />
        <NavGroupBlock group={PRIVATE_DEPLOYMENT_GROUP} />
        <SidebarSeparator />
        <NavGroupBlock group={ANALYTICS_GROUP} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3 text-[11px] text-foreground-subtle group-data-[collapsible=icon]:hidden">
        <p className="flex items-center gap-1.5">
          <span className="inline-flex size-1.5 rounded-full bg-success" aria-hidden />
          All systems operational
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
