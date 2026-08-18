import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('Tasklytic dashboard shell integration', () => {
  it('keeps Tasklytic in the shared shell with edge-to-edge bounded content', () => {
    const shell = read('components/layout/dashboard-shell.tsx')
    const topbar = read('components/layout/dashboard-topbar.tsx')

    expect(shell).toContain(
      "pathname.startsWith('/dashboard/project-management')",
    )
    expect(shell).not.toContain('isImmersiveEsign || isProjectManagement')
    expect(shell).toContain(
      "isProjectManagement && 'h-svh max-h-svh overflow-hidden'",
    )
    expect(shell).toContain("'h-full min-h-0 max-w-none p-0'")
    expect(shell).toContain('<AppSidebar />')
    expect(shell).toContain('<DashboardTopbar')
    expect(topbar).toContain('aria-label="Account menu"')
    expect(topbar).toContain('href="/contact"')
    expect(topbar).toContain('Sign out')
  })

  it('renders only workspace chrome beneath the shared dashboard chrome', () => {
    const chrome = read('project-management/TasklyticChrome.tsx')

    expect(chrome).not.toContain("from './features/shell/TasklyticTopbar'")
    expect(chrome).not.toContain('<TasklyticTopbar ')
    expect(chrome).not.toMatch(
      /AccountMenu|signOut|toggleTheme|tasklytic:theme/,
    )
    expect(chrome).toContain('h-full min-h-0 w-full min-w-0 overflow-hidden')
    expect(chrome).toContain('overflow-y-auto overflow-x-hidden p-3 sm:p-4')
    expect(chrome).toContain('className="hidden min-h-0 lg:flex"')
    expect(chrome).toContain('className="w-[min(240px,85vw)]')
    expect(chrome).toMatch(/<TasklyticSidebar\s+mode="drawer"/)
    expect(chrome).toContain('aria-label="Tasklytic module controls"')
    expect(chrome).toContain('<span>Tasklytic navigation</span>')
    expect(chrome).not.toContain('aria-label="Search Tasklytic"')
    expect(chrome).toContain('lg:hidden')
  })

  it('registers Tasklytic breadcrumbs, search, and actions with the shared top bar', () => {
    const moduleChrome = read('components/layout/dashboard-module-chrome.tsx')
    const shell = read('components/layout/dashboard-shell.tsx')
    const topbar = read('components/layout/dashboard-topbar.tsx')
    const chrome = read('project-management/TasklyticChrome.tsx')
    const actions = read(
      'project-management/features/shell/TasklyticTopbarActions.tsx',
    )

    expect(moduleChrome).toContain('export type DashboardModuleChrome')
    expect(moduleChrome).toContain('export function useDashboardModuleChrome')
    expect(shell).toContain('<DashboardModuleChromeProvider>')
    expect(shell).toContain(
      'resolveDashboardCommandPalette(moduleChrome, openGlobalPalette)',
    )
    expect(topbar).toContain('breadcrumbs={breadcrumbs}')
    expect(topbar).toContain('{actions}')
    expect(topbar).toContain('<SidebarTrigger')
    expect(chrome).toContain('useDashboardModuleChrome(moduleChrome)')
    expect(chrome).toContain('openCommandPalette: openTasklyticCommandPalette')
    expect(actions).toContain('aria-label="Tasklytic actions"')
    expect(actions).toContain('aria-label="Create in Tasklytic"')
    expect(actions).toContain('<RunningTimerChip />')
    expect(actions).toContain('<MiniInboxDropdown')
  })

  it('keeps rich Tasklytic results without duplicate host account controls', () => {
    const palette = read('project-management/features/shell/CommandPalette.tsx')

    for (const group of [
      'Pages',
      'Projects',
      'Tasks',
      'Goals',
      'People',
      'Create',
    ]) {
      expect(palette).toContain(`group: '${group}'`)
    }
    expect(palette).toContain("group: 'CPAAutomation destinations'")
    expect(palette).not.toMatch(/Sign out|Toggle theme|signOut|toggleTheme/)
  })

  it('puts tour, setup, and shortcut utilities in the Tasklytic navigator footer', () => {
    const sidebar = read(
      'project-management/features/shell/TasklyticSidebar.tsx',
    )
    const help = read('project-management/features/shell/HelpMenu.tsx')

    expect(sidebar).toContain('placement="sidebar"')
    expect(sidebar).toContain('onShowShortcuts')
    expect(sidebar).toContain('onRestartTour')
    expect(sidebar).toContain('onRestartSetup')
    expect(help).toContain('Keyboard shortcuts')
    expect(help).toContain('Restart product tour')
    expect(help).toContain('Restart setup wizard')
  })

  it('keeps the navigator default, collapsed, and drawer contracts distinct', () => {
    const store = read('project-management/stores/auth.ts')
    const sidebar = read(
      'project-management/features/shell/TasklyticSidebar.tsx',
    )
    const resizeHandle = read(
      'project-management/features/shell/SidebarResizeHandle.tsx',
    )

    expect(store).toContain('const SIDEBAR_WIDTH_DEFAULT = 240')
    expect(sidebar).toContain('const width = collapsed ? 56 : sidebarWidth')
    expect(sidebar).toContain("const drawer = mode === 'drawer'")
    expect(sidebar).toContain("width: drawer ? '100%' : width")
    expect(sidebar).toContain('!drawer ? <SidebarResizeHandle')
    expect(resizeHandle).toContain('e.clientX - sidebarLeft.current')
  })

  it('portals task detail overlays beyond the clipped dashboard content', () => {
    const taskDetail = read(
      'project-management/features/tasks/TaskDetailPane.tsx',
    )

    expect(taskDetail).toContain("import { createPortal } from 'react-dom'")
    expect(taskDetail).toContain('return createPortal(children, document.body)')
    expect(taskDetail.match(/<TaskDetailPortal>/g)).toHaveLength(2)
    expect(taskDetail.match(/bg-background(?:\s|\")/g)).toHaveLength(2)
  })

  it('removes superseded module-owned shell and portal compatibility code', () => {
    const removedFiles = [
      'project-management/components/branding/Logo.tsx',
      'project-management/features/profile/AccountMenu.tsx',
      'project-management/features/shell/TasklyticTopbar.tsx',
      'project-management/features/shell/TasklyticDialogContent.tsx',
      'project-management/features/ui/TasklyticAlertDialogContent.tsx',
      'project-management/features/ui/TasklyticDropdownMenuContent.tsx',
      'project-management/features/ui/TasklyticPopoverContent.tsx',
      'project-management/features/ui/TasklyticSelectContent.tsx',
      'project-management/features/ui/TasklyticTooltipContent.tsx',
      'project-management/hooks/useFocusTrap.ts',
      'project-management/styles/tasklytic.css',
    ]

    for (const file of removedFiles) {
      expect(existsSync(path.join(root, file)), file).toBe(false)
    }

    const design = read('project-management/Design.md')
    expect(design).toContain('the CPAAutomation design system is authoritative')
    expect(design).toContain(
      'It does not own an independent theme, logo, account shell, portal surface, or typography system.',
    )
  })
})
