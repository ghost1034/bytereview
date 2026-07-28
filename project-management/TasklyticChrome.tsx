'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CommandPalette } from './features/shell/CommandPalette'
import { TasklyticSidebar } from './features/shell/TasklyticSidebar'
import { TasklyticTopbar } from './features/shell/TasklyticTopbar'
import { KeyboardShortcutsDialog } from './features/shell/KeyboardShortcutsDialog'
import { AiAssistantPanel } from './features/ai/AiAssistantPanel'
import { QuickAddTaskDialog } from './features/tasks/QuickAddTaskDialog'
import { CreateProjectDialog } from './features/projects/CreateProjectDialog'
import { CreateGoalDialog } from './features/goals/CreateGoalDialog'
import { CreatePortfolioDialog } from './features/portfolios/CreatePortfolioDialog'
import { TasklyticErrorBoundary } from './features/ui/TasklyticErrorBoundary'
import { startProductTour } from './features/onboarding/ProductTour'
import { restartOnboardingWizard } from './features/onboarding/restartOnboarding'
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys'
import { useResolveDefaultWorkspace } from './hooks/useResolveDefaultWorkspace'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useTasklyticTheme } from './hooks/useTasklyticTheme'
import { useAuthStore, useUiStore } from './stores/auth'
import { useWorkspaceContext } from './hooks/useWorkspaceContext'

/** Client shell chrome for Tasklytic routes — sidebar + topbar + main. */
export function TasklyticChrome({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const [aiOpen, setAiOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createGoalOpen, setCreateGoalOpen] = useState(false)
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false)

  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const setCommandOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const shellAction = useUiStore((s) => s.shellAction)
  const clearShellAction = useUiStore((s) => s.clearShellAction)
  const { toggleDark, cycleTheme, theme } = useTasklyticTheme(rootRef)

  useResolveDefaultWorkspace()

  useGlobalHotkeys({
    onQuickAdd: () => setQuickAddOpen(true),
    onCollapseSidebar: () => setCollapsed(true),
    onExpandSidebar: () => setCollapsed(false),
    onToggleTheme: toggleDark,
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
      case 'toggleTheme':
        toggleDark()
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
  }, [clearShellAction, shellAction, toggleDark])

  return (
    <TasklyticErrorBoundary>
      <div
        ref={rootRef}
        className={`tasklytic-root flex min-h-[calc(100vh-var(--header-height))] w-full min-w-0${reducedMotion ? ' reduce-motion' : ''}`}
      >
        <a
          href="#tasklytic-main"
          className="fixed left-4 top-4 z-[100] -translate-y-16 rounded-lg px-3 py-2 text-sm font-medium shadow-paper-md transition-transform focus:translate-y-0 focus-visible:outline-none focus-visible:shadow-focus"
          style={{ background: 'var(--primary)', color: 'white' }}
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
            style={{ background: 'var(--bg-sunken)', borderColor: 'var(--border-subtle)' }}
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
            theme={theme}
            onThemeCycle={cycleTheme}
          />
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
