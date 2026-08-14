'use client'

import { useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CommandPalette } from './features/shell/CommandPalette'
import { TasklyticSidebar } from './features/shell/TasklyticSidebar'
import { TasklyticTopbar } from './features/shell/TasklyticTopbar'
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
const TimerBanner = dynamic(() => import('./features/psa/time/TimerBanner').then((module) => module.TimerBanner), { ssr: false })

/** Client shell chrome for Tasklytic routes — sidebar + topbar + main. */
export function TasklyticChrome({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  const [aiOpen, setAiOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createGoalOpen, setCreateGoalOpen] = useState(false)
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)

  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const shellAction = useUiStore((s) => s.shellAction)
  const clearShellAction = useUiStore((s) => s.clearShellAction)
  useResolveDefaultWorkspace()

  useGlobalHotkeys({
    onQuickAdd: () => setQuickAddOpen(true),
    onCollapseSidebar: () => setCollapsed(true),
    onExpandSidebar: () => setCollapsed(false),
    onToggleTimer: () => setTimerOpen((open) => !open),
    onShowShortcuts: () => setShortcutsOpen(true),
    onOpenCommand: () => setCommandOpen(true),
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
        className={`tasklytic-root flex min-h-dvh w-full min-w-0${reducedMotion ? ' reduce-motion' : ''}`}
      >
        <a
          href="#tasklytic-main"
          className="fixed left-4 top-4 z-[100] -translate-y-16 rounded-lg px-3 py-2 text-sm font-medium shadow-md transition-transform focus:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ background: 'hsl(var(--primary))', color: 'white' }}
        >
          Skip to content
        </a>

        <div className="hidden lg:flex">
          <TasklyticSidebar />
        </div>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="w-[min(320px,85vw)] p-0 [&>button]:hidden"
            style={{ background: 'hsl(var(--surface-muted))', borderColor: 'hsl(var(--border))' }}
          >
            <TasklyticSidebar onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TasklyticTopbar
            showMenuButton
            onMenuClick={() => setMobileNavOpen(true)}
            onShortcuts={() => setShortcutsOpen(true)}
            onRestartTour={() => startProductTour()}
            onRestartSetup={
              currentUserId
                ? () => {
                    void restartOnboardingWizard(currentUserId)
                  }
                : undefined
            }
            timerOpen={timerOpen}
            onTimerOpenChange={setTimerOpen}
          />
          <TimerBanner />
          <main id="tasklytic-main" className="min-w-0 flex-1 overflow-auto p-4 lg:p-6">
            {children}
          </main>
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
          </>
        ) : null}
      </div>
    </TasklyticErrorBoundary>
  )
}
