'use client'

import { useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Receipt,
  Target,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { SidebarNavLink } from './SidebarNavLink'
import { isRouteActive, type NavItem } from './sidebarUtils'

type Props = {
  collapsed: boolean
  pinned: NavItem[]
  insights: NavItem[]
  psa: NavItem[]
  onNavigate?: () => void
  sectionLabel: (label: string, action?: ReactNode) => ReactNode
}

export function SidebarNavSections({
  collapsed,
  pinned,
  insights,
  psa,
  onNavigate,
  sectionLabel,
}: Props) {
  const pathname = usePathname()
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [psaOpen, setPsaOpen] = useState(true)

  return (
    <>
      {sectionLabel('Pinned')}
      <div className="flex flex-col gap-0.5">
        {pinned.map((item) => (
          <SidebarNavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isRouteActive(pathname, item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <Collapsible open={insightsOpen} onOpenChange={setInsightsOpen}>
        {sectionLabel(
          'Insights',
          <CollapsibleTrigger asChild>
            <button type="button" className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="Toggle insights">
              {insightsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent className="flex flex-col gap-0.5">
          {insights.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              active={isRouteActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={psaOpen} onOpenChange={setPsaOpen}>
        {sectionLabel(
          'PSA',
          <CollapsibleTrigger asChild>
            <button type="button" className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="Toggle PSA section">
              {psaOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent className="flex flex-col gap-0.5">
          {psa.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              active={isRouteActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
