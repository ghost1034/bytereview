'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Briefcase,
  FileText,
  PenTool,
  Settings,
  LogOut,
  Plug,
  Zap,
  GraduationCap,
  Clock,
  Bot
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  badgeColor?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { signOut } = useAuth()

  const udaGroup: NavGroup = {
    label: 'Universal Document Analysis',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: Home },
      { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
      { name: 'Templates', href: '/dashboard/templates', icon: FileText },
      { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
      { name: 'Automations', href: '/dashboard/automations', icon: Zap },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings },
      { name: 'CPE Tracker', href: '/dashboard/cpe-tracker', icon: GraduationCap, badge: 'Free', badgeColor: 'bg-green-100 text-green-700' },
    ],
  }

  const productLinks: NavItem[] = [
    { name: 'Inkwise', href: '/dashboard/inkwise', icon: PenTool },
    { name: 'Chrona', href: '/#chrona-showcase', icon: Clock, badge: 'Soon', badgeColor: 'bg-gray-100 text-gray-500' },
    { name: 'Claw Series', href: '/#claw-showcase', icon: Bot, badge: 'Soon', badgeColor: 'bg-gray-100 text-gray-500' },
  ]

  const isCurrent = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isCurrent(item.href)
            ? "bg-blue-50 text-blue-700 border border-blue-200"
            : "text-gray-700 hover:bg-gray-100",
          collapsed && "justify-center"
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!collapsed && (
          <>
            <span>{item.name}</span>
            {item.badge && (
              <span className={cn("ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded", item.badgeColor)}>
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    )
  }

  return (
    <div className={cn(
      "dashboard-sidebar-shell flex flex-col border-r border-gray-200 bg-white transition-all duration-300",
      collapsed ? "w-16" : "w-64",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <span className="font-semibold text-gray-900">Navigation</span>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="p-2"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* UDA group */}
        {!collapsed && (
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pb-1">
            Universal Document Analysis (UDA)
          </p>
        )}
        {udaGroup.items.map(renderItem)}

        {/* Divider */}
        <div className={cn("border-t border-gray-200", collapsed ? "my-2" : "my-3")} />

        {/* Product links */}
        {!collapsed && (
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-1 pb-1">
            Products
          </p>
        )}
        {productLinks.map(renderItem)}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <Button
          variant="ghost"
          onClick={signOut}
          className={cn(
            "w-full justify-start text-gray-700 hover:bg-gray-100",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="ml-3">Sign Out</span>}
        </Button>
      </div>
    </div>
  )
}
