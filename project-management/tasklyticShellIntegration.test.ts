import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('Tasklytic dashboard shell integration', () => {
  it('keeps Tasklytic in the shared shell with edge-to-edge bounded content', () => {
    const shell = read('components/layout/dashboard-shell.tsx')
    const topbar = read('components/layout/dashboard-topbar.tsx')

    expect(shell).toContain("pathname.startsWith('/dashboard/project-management')")
    expect(shell).not.toContain('isImmersiveEsign || isProjectManagement')
    expect(shell).toContain("isProjectManagement && 'h-svh max-h-svh overflow-hidden'")
    expect(shell).toContain("'h-full min-h-0 max-w-none p-0'")
    expect(shell).toContain('<AppSidebar />')
    expect(shell).toContain('<DashboardTopbar')
    expect(topbar).toContain('aria-label="Account menu"')
    expect(topbar).toContain('href="/contact"')
    expect(topbar).toContain('Sign out')
  })

  it('renders only workspace chrome beneath the shared dashboard chrome', () => {
    const chrome = read('project-management/TasklyticChrome.tsx')

    expect(chrome).not.toContain('TasklyticTopbar')
    expect(chrome).not.toMatch(/AccountMenu|signOut|toggleTheme|tasklytic:theme/)
    expect(chrome).toContain('h-full min-h-0 w-full min-w-0 overflow-hidden')
    expect(chrome).toContain('overflow-y-auto overflow-x-hidden p-3 sm:p-4')
    expect(chrome).toContain('className="hidden min-h-0 lg:flex"')
    expect(chrome).toContain('className="w-[min(240px,85vw)]')
    expect(chrome).toContain('<TasklyticSidebar mode="drawer"')
    expect(chrome).toContain('aria-label="Tasklytic module controls"')
    expect(chrome).toContain('lg:hidden')
  })

  it('keeps the navigator default, collapsed, and drawer contracts distinct', () => {
    const store = read('project-management/stores/auth.ts')
    const sidebar = read('project-management/features/shell/TasklyticSidebar.tsx')
    const resizeHandle = read('project-management/features/shell/SidebarResizeHandle.tsx')

    expect(store).toContain('const SIDEBAR_WIDTH_DEFAULT = 240')
    expect(sidebar).toContain('const width = collapsed ? 56 : sidebarWidth')
    expect(sidebar).toContain("const drawer = mode === 'drawer'")
    expect(sidebar).toContain("width: drawer ? '100%' : width")
    expect(sidebar).toContain('!drawer ? <SidebarResizeHandle')
    expect(resizeHandle).toContain('e.clientX - sidebarLeft.current')
  })
})
