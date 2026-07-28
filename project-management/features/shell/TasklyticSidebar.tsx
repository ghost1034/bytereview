'use client'

/**
 * TasklyticSidebar — Asana-style left nav (240px / 56px collapsed, resizable 200–320px).
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  Briefcase,
  CheckSquare,
  Clock,
  FileText,
  Home,
  Landmark,
  LayoutTemplate,
  Plus,
  Receipt,
  Target,
  Timer,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkspaceSwitcher } from '../workspaces/WorkspaceSwitcher'
import { CreateProjectDialog } from '../projects/CreateProjectDialog'
import { useAuthStore, useUiStore } from '../../stores/auth'
import {
  useNotificationsStore,
  useProjectsStore,
  useUsersStore,
} from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { ProjectNavRow } from './ProjectNavRow'
import { SidebarFooter } from './SidebarFooter'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { SidebarNavSections } from './SidebarNavSections'
import { InvitePeopleDialog } from './InvitePeopleDialog'
import { TasklyticEmptyState } from '../ui/TasklyticEmptyState'
import type { NavItem } from './sidebarUtils'

type Props = {
  onNavigate?: () => void
}

export function TasklyticSidebar({ onNavigate }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth)
  const unread = useNotificationsStore((s) => s.list().filter((n) => n.unread && !n.archived).length)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const starredIds = currentUser?.starredProjectIds ?? []

  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [starredOpen, setStarredOpen] = useState(true)

  const projects = useProjectsStore((s) =>
    s
      .list()
      .filter(
        (p) =>
          p.workspaceId === workspaceId &&
          !p.archived &&
          currentUserId &&
          p.memberIds.includes(currentUserId)
      )
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  )

  const starredProjects = useMemo(
    () => projects.filter((p) => starredIds.includes(p.id)),
    [projects, starredIds]
  )
  const regularProjects = useMemo(
    () => projects.filter((p) => !starredIds.includes(p.id)),
    [projects, starredIds]
  )

  const base = workspaceId ? `/dashboard/tasklytic/w/${workspaceId}` : null

  const pinned: NavItem[] = useMemo(
    () =>
      base
        ? [
            { href: `${base}/home`, label: 'Home', icon: Home },
            { href: `${base}/my-tasks`, label: 'My Tasks', icon: CheckSquare, tourId: 'my-tasks' },
            { href: `${base}/inbox`, label: 'Inbox', icon: Bell, badge: unread || undefined },
          ]
        : [],
    [base, unread]
  )

  const insights: NavItem[] = useMemo(
    () =>
      base
        ? [
            { href: `${base}/reporting`, label: 'Reporting', icon: BarChart3, tourId: 'reporting' },
            { href: `${base}/portfolios`, label: 'Portfolios', icon: Briefcase },
            { href: `${base}/goals`, label: 'Goals', icon: Target },
            { href: `${base}/templates`, label: 'Templates', icon: LayoutTemplate },
          ]
        : [],
    [base]
  )

  const psa: NavItem[] = useMemo(
    () =>
      base
        ? [
            { href: `${base}/psa/time`, label: 'Time', icon: Clock },
            { href: `${base}/psa/timesheets`, label: 'Timesheets', icon: Timer },
            { href: `${base}/psa/expenses`, label: 'Expenses', icon: Receipt },
            { href: `${base}/psa/clients`, label: 'Clients', icon: Users },
            { href: `${base}/psa/matters`, label: 'Matters', icon: Briefcase },
            { href: `${base}/psa/invoicing`, label: 'Invoicing', icon: FileText },
            { href: `${base}/psa/trust`, label: 'Trust', icon: Landmark },
            { href: `${base}/psa/reports`, label: 'PSA Reports', icon: BarChart3 },
          ]
        : [],
    [base]
  )

  if (!workspaceId || !base) return null

  const width = collapsed ? 56 : sidebarWidth

  const sectionLabel = (label: string, action?: ReactNode) =>
    !collapsed ? (
      <div className="flex items-center justify-between px-2.5 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
          {label}
        </span>
        {action}
      </div>
    ) : null

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="relative flex h-full shrink-0 flex-col border-r transition-[width] duration-200 ease-out"
        style={{ width, borderColor: 'var(--border-subtle)', background: 'var(--bg-sunken)' }}
        aria-label="Tasklytic navigation"
        data-tour="sidebar"
      >
        <SidebarResizeHandle width={sidebarWidth} collapsed={collapsed} onWidthChange={setSidebarWidth} />

        <div className={cn('border-b p-2', collapsed && 'px-1')} style={{ borderColor: 'var(--border-subtle)' }}>
          <WorkspaceSwitcher fullWidth />
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <SidebarNavSections
            collapsed={collapsed}
            pinned={pinned}
            insights={insights}
            psa={psa}
            onNavigate={onNavigate}
            sectionLabel={sectionLabel}
          />

          {starredProjects.length > 0 ? (
            <Collapsible open={starredOpen} onOpenChange={setStarredOpen}>
              {sectionLabel('Starred')}
              <CollapsibleContent className="flex flex-col gap-0.5">
                {starredProjects.map((p) => (
                  <ProjectNavRow
                    key={p.id}
                    project={p}
                    href={`${base}/projects/${p.id}`}
                    starred
                    collapsed={collapsed}
                    currentUserId={currentUserId}
                    starredIds={starredIds}
                    onNavigate={onNavigate}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
            {sectionLabel(
              'Projects',
              <button
                type="button"
                className="rounded p-0.5 focus-visible:outline-none focus-visible:shadow-focus"
                aria-label="Create project"
                onClick={() => setCreateProjectOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
              </button>
            )}
            <CollapsibleContent className="flex flex-col gap-0.5">
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center justify-center rounded-lg focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => setCreateProjectOpen(true)}
                      aria-label="Create project"
                    >
                      <Plus className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="tl-popover-surface" side="right">Create project</TooltipContent>
                </Tooltip>
              ) : null}
              {regularProjects.map((p) => (
                <ProjectNavRow
                  key={p.id}
                  project={p}
                  href={`${base}/projects/${p.id}`}
                  starred={starredIds.includes(p.id)}
                  collapsed={collapsed}
                  currentUserId={currentUserId}
                  starredIds={starredIds}
                  onNavigate={onNavigate}
                />
              ))}
              {!collapsed && !projects.length ? (
                <div className="px-2 py-2">
                  <TasklyticEmptyState
                    headline="No projects yet"
                    subhead="Create a project to organize work for your team."
                    ctaLabel="New project"
                    onCta={() => setCreateProjectOpen(true)}
                    learnMoreHref="/docs/projects"
                    className="py-6"
                  />
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        </nav>

        <SidebarFooter
          collapsed={collapsed}
          currentUser={currentUser}
          onInvite={() => setInviteOpen(true)}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>

      <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} workspaceId={workspaceId} />
      <InvitePeopleDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </TooltipProvider>
  )
}
