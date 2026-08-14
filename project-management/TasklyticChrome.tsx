'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useDashboardModuleChrome } from '@/components/layout/dashboard-module-chrome'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { CommandPalette } from './features/shell/CommandPalette'
import { TasklyticSidebar } from './features/shell/TasklyticSidebar'
import { TasklyticTopbarActions } from './features/shell/TasklyticTopbarActions'
import { KeyboardShortcutsDialog } from './features/shell/KeyboardShortcutsDialog'
import { TasklyticErrorBoundary } from './features/ui/TasklyticErrorBoundary'
import { startProductTour } from './features/onboarding/productTourLauncher'
import { restartOnboardingWizard } from './features/onboarding/restartOnboarding'
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys'
import { useResolveDefaultWorkspace } from './hooks/useResolveDefaultWorkspace'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useAuthStore, useUiStore } from './stores/auth'
import { useWorkspaceContext } from './hooks/useWorkspaceContext'

const AiAssistantPanel = dynamic(() => import('./features/ai/AiAssistantPanel').then((module) => module.AiAssistantPanel), { ssr: false })
const QuickAddTaskDialog = dynamic(() => import('./features/tasks/QuickAddTaskDialog').then((module) => module.QuickAddTaskDialog), { ssr: false })
const CreateProjectDialog = dynamic(() => import('./features/projects/CreateProjectDialog').then((module) => module.CreateProjectDialog), { ssr: false })
const CreateGoalDialog = dynamic(() => import('./features/goals/CreateGoalDialog').then((module) => module.CreateGoalDialog), { ssr: false })
const CreatePortfolioDialog = dynamic(() => import('./features/portfolios/CreatePortfolioDialog').then((module) => module.CreatePortfolioDialog), { ssr: false })
const CreateFormDialog = dynamic(() => import('./features/forms/CreateFormDialog').then((module) => module.CreateFormDialog), { ssr: false })
const CreateDashboardDialog = dynamic(() => import('./features/reporting/CreateDashboardDialog').then((module) => module.CreateDashboardDialog), { ssr: false })
const TimerBanner = dynamic(() => import('./features/psa/time/TimerBanner').then((module) => module.TimerBanner), { ssr: false })

/** Tasklytic workspace chrome nested inside CPAAutomation's dashboard shell. */
export function TasklyticChrome({ children }: { children: ReactNode }) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const [aiOpen, setAiOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createGoalOpen, setCreateGoalOpen] = useState(false)
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false)
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false)

  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const breadcrumbs = useUiStore((s) => s.breadcrumbs)
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const shellAction = useUiStore((s) => s.shellAction)
  const clearShellAction = useUiStore((s) => s.clearShellAction)
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? 'Tasklytic'
  const openTasklyticCommandPalette = useCallback(() => setCommandOpen(true), [setCommandOpen])
  const restartSetup = useCallback(() => {
    if (currentUserId) void restartOnboardingWizard(currentUserId)
  }, [currentUserId])
  const moduleActions = useMemo(
    () => (
      <TasklyticTopbarActions
        onCreateTask={() => setQuickAddOpen(true)}
        onCreateProject={() => setCreateProjectOpen(true)}
        onCreateForm={() => setCreateFormOpen(true)}
        onCreatePortfolio={() => setCreatePortfolioOpen(true)}
        onCreateDashboard={() => setCreateDashboardOpen(true)}
      />
    ),
    [],
  )
  const moduleChrome = useMemo(
    () => ({
      breadcrumbs,
      openCommandPalette: openTasklyticCommandPalette,
      actions: moduleActions,
    }),
    [breadcrumbs, moduleActions, openTasklyticCommandPalette],
  )
  useDashboardModuleChrome(moduleChrome)
  useResolveDefaultWorkspace()

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeDrawerAtDesktop = () => {
      if (desktop.matches) setMobileNavOpen(false)
    }
    closeDrawerAtDesktop()
    desktop.addEventListener('change', closeDrawerAtDesktop)
    return () => desktop.removeEventListener('change', closeDrawerAtDesktop)
  }, [])

  useGlobalHotkeys({
    onQuickAdd: () => setQuickAddOpen(true),
    onCollapseSidebar: () => setCollapsed(true),
    onExpandSidebar: () => setCollapsed(false),
    onShowShortcuts: () => setShortcutsOpen(true),
  })

  useEffect(() => {
    if (!shellAction) return
    switch (shellAction) {
      case 'quickAdd':
        setQuickAddOpen(true)
        break
      case 'createProject':
        setCreateProjectOpen(true)
        break
      case 'createGoal':
        setCreateGoalOpen(true)
        break
      case 'createPortfolio':
        setCreatePortfolioOpen(true)
        break
      case 'showShortcuts':
        setShortcutsOpen(true)
        break
      case 'restartTour':
        startProductTour()
        break
      default:
        break
    }
    clearShellAction()
  }, [clearShellAction, shellAction])

  return (
    <TasklyticErrorBoundary>
      <div
        className={`tasklytic-root flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-background font-sans text-foreground${reducedMotion ? ' reduce-motion' : ''}`}
      >
        <div className="hidden min-h-0 lg:flex">
          <TasklyticSidebar
            onShowShortcuts={() => setShortcutsOpen(true)}
            onRestartTour={startProductTour}
            onRestartSetup={restartSetup}
          />
        </div>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="w-[min(240px,85vw)] p-0 [&>button]:hidden"
            style={{ background: 'hsl(var(--surface-muted))', borderColor: 'hsl(var(--border))' }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Tasklytic navigation</SheetTitle>
              <SheetDescription>Switch workspaces and open Tasklytic projects and tools.</SheetDescription>
            </SheetHeader>
            <TasklyticSidebar
              mode="drawer"
              onNavigate={() => setMobileNavOpen(false)}
              onShowShortcuts={() => setShortcutsOpen(true)}
              onRestartTour={startProductTour}
              onRestartSetup={restartSetup}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background px-2 lg:hidden"
            aria-label="Tasklytic module controls"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2"
              aria-label="Open Tasklytic navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-4" />
              <span>Tasklytic navigation</span>
            </Button>

            <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{pageTitle}</span>
          </div>

          <TimerBanner />
          <div id="tasklytic-content" className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
            {children}
          </div>
        </div>

        <CommandPalette />
        <AiAssistantPanel open={aiOpen} onOpenChange={setAiOpen} />
        <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

        {workspaceId ? (
          <>
            <QuickAddTaskDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} workspaceId={workspaceId} />
            <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} workspaceId={workspaceId} />
            <CreateGoalDialog open={createGoalOpen} onOpenChange={setCreateGoalOpen} workspaceId={workspaceId} />
            <CreatePortfolioDialog open={createPortfolioOpen} onOpenChange={setCreatePortfolioOpen} workspaceId={workspaceId} />
            <CreateFormDialog
              open={createFormOpen}
              onOpenChange={setCreateFormOpen}
              workspaceId={workspaceId}
              onCreated={() => router.push(`/dashboard/project-management/w/${workspaceId}/forms`)}
            />
            <CreateDashboardDialog
              open={createDashboardOpen}
              onOpenChange={setCreateDashboardOpen}
              workspaceId={workspaceId}
              onCreated={(id) => router.push(`/dashboard/project-management/w/${workspaceId}/reporting/${id}`)}
            />
          </>
        ) : null}
      </div>
    </TasklyticErrorBoundary>
  )
}
