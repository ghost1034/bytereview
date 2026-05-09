'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bot,
  Briefcase,
  Clock,
  Files,
  FileText,
  GraduationCap,
  Home,
  PenTool,
  Plug,
  Settings as SettingsIcon,
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
  label: 'Document Analysis',
  items: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
    { name: 'Templates', href: '/dashboard/templates', icon: FileText },
    { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { name: 'Automations', href: '/dashboard/automations', icon: Zap },
    { name: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
    {
      name: 'CPE Tracker',
      href: '/dashboard/cpe-tracker',
      icon: GraduationCap,
      badge: 'Free',
      badgeTone: 'success',
    },
  ],
}

const PRODUCTS_GROUP: NavGroup = {
  key: 'products',
  label: 'Products',
  items: [
    { name: 'Form Fill', href: '/dashboard/form-fill', icon: Files },
    { name: 'Inkwise', href: '/dashboard/inkwise', icon: PenTool },
    {
      name: 'Chrona',
      href: '/#chrona-showcase',
      icon: Clock,
      badge: 'Soon',
      badgeTone: 'muted',
    },
    {
      name: 'Claw Series',
      href: '/#claw-showcase',
      icon: Bot,
      badge: 'Soon',
      badgeTone: 'muted',
    },
  ],
}

function isActiveHref(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
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
          href="/dashboard"
          className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-md"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">CA</span>
          </span>
          <span className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-tight text-foreground">
              CPAAutomation
            </span>
            <span className="text-[11px] leading-tight text-foreground-subtle">
              AI Document Suite
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <NavGroupBlock group={UDA_GROUP} />
        <SidebarSeparator />
        <NavGroupBlock group={PRODUCTS_GROUP} />
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
