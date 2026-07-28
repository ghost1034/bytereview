'use client'

/**
 * Tasklytic module navigation — pinned shortcuts within the workspace shell.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bell,
  Briefcase,
  CheckSquare,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  LayoutTemplate,
  Settings,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceContext } from './hooks/useWorkspaceContext'
import { useNotificationsStore } from './stores/entities'

export function TasklyticModuleNav() {
  const pathname = usePathname()
  const { workspaceId } = useWorkspaceContext()
  const unread = useNotificationsStore((s) => s.list().filter((n) => n.unread && !n.archived).length)

  if (!workspaceId) return null

  const base = `/dashboard/project-management/w/${workspaceId}`
  const items = [
    { href: `${base}/home`, label: 'Home', icon: Home },
    { href: `${base}/my-tasks`, label: 'My Tasks', icon: CheckSquare },
    { href: `${base}/inbox`, label: 'Inbox', icon: Bell, badge: unread },
    { href: `${base}/projects`, label: 'Projects', icon: FolderKanban },
    { href: `${base}/portfolios`, label: 'Portfolios', icon: Briefcase },
    { href: `${base}/goals`, label: 'Goals', icon: Target },
    { href: `${base}/forms`, label: 'Forms', icon: FileText },
    { href: `${base}/workload`, label: 'Workload', icon: Gauge },
    { href: `${base}/reporting`, label: 'Reporting', icon: BarChart3 },
    { href: `${base}/templates`, label: 'Templates', icon: LayoutTemplate },
    { href: `${base}/settings`, label: 'Settings', icon: Settings },
  ]

  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl border p-1.5 shadow-paper-sm" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-muted)' }} aria-label="Project management sections">
      {items.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              active ? 'shadow-paper-sm' : 'hover:opacity-90'
            )}
            style={
              active
                ? { background: 'var(--primary-soft)', color: 'var(--primary)' }
                : { color: 'var(--ink-secondary)' }
            }
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
