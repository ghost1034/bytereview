'use client'

/**
 * TasklyticTopbar — breadcrumbs, search, create menu, notifications, theme, help, account.
 */
import { useState } from 'react'
import Link from 'next/link'
import {
  Menu,
  Moon,
  Monitor,
  Plus,
  Search,
  Sun,
} from 'lucide-react'
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
import type { TasklyticTheme } from '../../hooks/useTasklyticTheme'
import { CreateProjectDialog } from '../projects/CreateProjectDialog'
import { CreateGoalDialog } from '../goals/CreateGoalDialog'
import { CreatePortfolioDialog } from '../portfolios/CreatePortfolioDialog'
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
  theme?: TasklyticTheme
  onThemeCycle?: () => void
}

const THEME_ICONS: Record<TasklyticTheme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const THEME_LABELS: Record<TasklyticTheme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

export function TasklyticTopbar({
  onMenuClick,
  showMenuButton,
  onShortcuts,
  onRestartTour,
  onRestartSetup,
  theme = 'system',
  onThemeCycle,
}: Props) {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const breadcrumbs = useUiStore((s) => s.breadcrumbs)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const timerRunning = useTimerStore((s) => s.running)

  const [taskOpen, setTaskOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const inboxHref = workspaceId ? `/dashboard/project-management/w/${workspaceId}/inbox` : '#'
  const ThemeIcon = THEME_ICONS[theme]
  const pageTitle = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1]?.label : 'AI Project Management'

  return (
    <>
      <header
        data-tour="topbar"
        className="flex h-[52px] shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md lg:px-4"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'color-mix(in srgb, var(--bg-base) 80%, transparent)',
        }}
      >
        {showMenuButton ? (
          <button
            type="button"
            className="rounded-lg p-2 lg:hidden focus-visible:outline-none focus-visible:shadow-focus"
            aria-label="Open navigation"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" style={{ color: 'var(--ink-secondary)' }} />
          </button>
        ) : null}

        <nav className="hidden min-w-0 flex-1 items-center gap-1 text-sm lg:flex" aria-label="Breadcrumb">
          {breadcrumbs.length === 0 ? (
            <span className="truncate font-medium" style={{ color: 'var(--ink-primary)' }}>AI Project Management</span>
          ) : (
            breadcrumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span style={{ color: 'var(--ink-faint)' }}>/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                    style={{ color: i === breadcrumbs.length - 1 ? 'var(--ink-primary)' : 'var(--ink-muted)' }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="truncate font-medium"
                    style={{ color: i === breadcrumbs.length - 1 ? 'var(--ink-primary)' : 'var(--ink-muted)' }}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))
          )}
        </nav>

        <span className="min-w-0 flex-1 truncate text-sm font-medium lg:hidden" style={{ color: 'var(--ink-primary)' }}>
          {pageTitle}
        </span>

        <div id="topbar-tabs" className="hidden items-center lg:flex" />

        <button
          type="button"
          className={cn(
            'hidden flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm lg:flex',
            'max-w-[480px] focus-visible:outline-none focus-visible:shadow-focus'
          )}
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'var(--bg-muted)',
            color: 'var(--ink-muted)',
          }}
          onClick={() => setCommandOpen(true)}
          aria-label="Open search"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span>Search… (⌘K)</span>
        </button>

        <button
          type="button"
          className="rounded-lg p-2 lg:hidden focus-visible:outline-none focus-visible:shadow-focus"
          aria-label="Search"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="h-5 w-5" style={{ color: 'var(--ink-secondary)' }} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="tl-btn-primary hidden gap-1 lg:flex" aria-label="Create">
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="tl-popover-surface" align="end">
            <DropdownMenuItem onClick={() => setTaskOpen(true)}>Task</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProjectOpen(true)}>Project</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGoalOpen(true)}>Goal</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPortfolioOpen(true)}>Portfolio</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={cn('hidden lg:block', timerRunning && 'glow-pulse rounded-lg')}>
          <RunningTimerChip />
        </div>

        {currentUserId && workspaceId ? (
          <div className="hidden lg:block">
            <MiniInboxDropdown userId={currentUserId} inboxHref={inboxHref} />
          </div>
        ) : null}

        <button
          type="button"
          className="hidden rounded-lg p-2 focus-visible:outline-none focus-visible:shadow-focus lg:block"
          aria-label={`Theme: ${THEME_LABELS[theme]}. Click to cycle.`}
          onClick={() => onThemeCycle?.()}
        >
          <ThemeIcon className="h-5 w-5" style={{ color: 'var(--ink-secondary)' }} />
        </button>

        <div className="hidden lg:block">
          <HelpMenu
            onFeedback={() => setFeedbackOpen(true)}
            onShortcuts={onShortcuts}
            onRestartTour={onRestartTour}
            onRestartSetup={onRestartSetup}
          />
        </div>

        <AccountMenu theme={theme} onThemeCycle={onThemeCycle} compact={false} />
      </header>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {workspaceId ? (
        <>
          <QuickAddTaskDialog open={taskOpen} onOpenChange={setTaskOpen} workspaceId={workspaceId} />
          <CreateProjectDialog open={projectOpen} onOpenChange={setProjectOpen} workspaceId={workspaceId} />
          <CreateGoalDialog open={goalOpen} onOpenChange={setGoalOpen} workspaceId={workspaceId} />
          <CreatePortfolioDialog open={portfolioOpen} onOpenChange={setPortfolioOpen} workspaceId={workspaceId} />
        </>
      ) : null}
    </>
  )
}
