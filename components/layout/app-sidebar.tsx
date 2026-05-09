'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
