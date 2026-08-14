'use client'

/**
 * TasklyticTopbar — breadcrumbs, search, create menu, notifications, help, and account.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore, useUiStore } from '../../stores/auth'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { CreateProjectDialog } from '../projects/CreateProjectDialog'
import { CreatePortfolioDialog } from '../portfolios/CreatePortfolioDialog'
import { CreateFormDialog } from '../forms/CreateFormDialog'
import { CreateDashboardDialog } from '../reporting/CreateDashboardDialog'
import { QuickAddTaskDialog } from '../tasks/QuickAddTaskDialog'
import { MiniInboxDropdown } from '../inbox/MiniInboxDropdown'
import { RunningTimerChip } from '../psa/time/RunningTimerChip'
import { AccountMenu } from '../profile/AccountMenu'
import { useTimerStore } from '../../stores/timerStore'
import { HelpMenu } from './HelpMenu'
import { FeedbackDialog } from './FeedbackDialog'

type Props = {
  onMenuClick?: () => void
  showMenuButton?: boolean
  onShortcuts: () => void
  onRestartTour: () => void
  onRestartSetup?: () => void
  timerOpen?: boolean
  onTimerOpenChange?: (open: boolean) => void
}

export function TasklyticTopbar({
  onMenuClick,
  showMenuButton,
  onShortcuts,
  onRestartTour,
  onRestartSetup,
  timerOpen,
  onTimerOpenChange,
}: Props) {
  const { workspaceId } = useWorkspaceContext()
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const breadcrumbs = useUiStore((s) => s.breadcrumbs)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const timerRunning = useTimerStore((s) => currentUserId ? s.runningByUser[currentUserId] ?? null : null)

  const [taskOpen, setTaskOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const inboxHref = workspaceId ? `/dashboard/project-management/w/${workspaceId}/inbox` : '#'
  const pageTitle = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1]?.label : 'Tasklytic'

  return (
    <>
      <header
        data-tour="topbar"
        className="flex h-[52px] shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md lg:px-4"
        style={{
          borderColor: 'hsl(var(--border))',
          background: 'color-mix(in srgb, hsl(var(--background)) 80%, transparent)',
        }}
      >
        {showMenuButton ? (
          <button
            type="button"
            className="rounded-lg p-2 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Open navigation"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" style={{ color: 'hsl(var(--foreground-muted))' }} />
          </button>
        ) : null}

        <nav className="hidden min-w-0 flex-1 items-center gap-1 text-sm lg:flex" aria-label="Breadcrumb">
          {breadcrumbs.length === 0 ? (
            <span className="truncate font-medium" style={{ color: 'hsl(var(--foreground))' }}>Tasklytic</span>
          ) : (
            breadcrumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span style={{ color: 'hsl(var(--foreground-subtle))' }}>/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    style={{ color: i === breadcrumbs.length - 1 ? 'hsl(var(--foreground))' : 'hsl(var(--foreground-muted))' }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="truncate font-medium"
                    style={{ color: i === breadcrumbs.length - 1 ? 'hsl(var(--foreground))' : 'hsl(var(--foreground-muted))' }}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))
          )}
        </nav>

        <span className="min-w-0 flex-1 truncate text-sm font-medium lg:hidden" style={{ color: 'hsl(var(--foreground))' }}>
          {pageTitle}
        </span>

        <div id="topbar-tabs" className="hidden items-center lg:flex" />

        <button
          type="button"
          className={cn(
            'hidden flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm lg:flex',
            'max-w-[480px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
          style={{
            borderColor: 'hsl(var(--border))',
            background: 'hsl(var(--surface-muted))',
            color: 'hsl(var(--foreground-muted))',
          }}
          onClick={() => setCommandOpen(true)}
          aria-label="Open search"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span>Search… (⌘K)</span>
        </button>

        <button
          type="button"
          className="rounded-lg p-2 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Search"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="h-5 w-5" style={{ color: 'hsl(var(--foreground-muted))' }} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="tl-btn-primary h-9 gap-1 px-2 lg:px-3" aria-label="Create">
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTaskOpen(true)}>Task</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProjectOpen(true)}>Project</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFormOpen(true)}>Form</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPortfolioOpen(true)}>Portfolio</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDashboardOpen(true)}>Dashboard</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={cn(timerRunning && 'bg-primary-soft rounded-lg')}>
          <RunningTimerChip open={timerOpen} onOpenChange={onTimerOpenChange} />
        </div>

        {currentUserId && workspaceId ? (
          <div className="hidden lg:block">
            <MiniInboxDropdown userId={currentUserId} inboxHref={inboxHref} />
          </div>
        ) : null}

        <div className="hidden lg:block">
          <HelpMenu
            onFeedback={() => setFeedbackOpen(true)}
            onShortcuts={onShortcuts}
            onRestartTour={onRestartTour}
            onRestartSetup={onRestartSetup}
          />
        </div>

        <AccountMenu compact={false} />
      </header>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {workspaceId ? (
        <>
          <QuickAddTaskDialog open={taskOpen} onOpenChange={setTaskOpen} workspaceId={workspaceId} />
          <CreateProjectDialog open={projectOpen} onOpenChange={setProjectOpen} workspaceId={workspaceId} />
          <CreatePortfolioDialog open={portfolioOpen} onOpenChange={setPortfolioOpen} workspaceId={workspaceId} />
          <CreateFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            workspaceId={workspaceId}
            onCreated={() => router.push(`/dashboard/project-management/w/${workspaceId}/forms`)}
          />
          <CreateDashboardDialog
            open={dashboardOpen}
            onOpenChange={setDashboardOpen}
            workspaceId={workspaceId}
            onCreated={(id) => router.push(`/dashboard/project-management/w/${workspaceId}/reporting/${id}`)}
          />
        </>
      ) : null}
    </>
  )
}
