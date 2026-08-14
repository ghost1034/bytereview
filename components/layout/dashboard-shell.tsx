'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Briefcase,
  FileText,
  FolderKanban,
  Home,
  Plug,
  Settings as SettingsIcon,
  Zap,
  GraduationCap,
  Files,
  ClipboardCheck,
  FileSignature,
  PenTool,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

import { AppSidebar } from './app-sidebar'
import {
  DashboardModuleChromeProvider,
  resolveDashboardCommandPalette,
  useRegisteredDashboardModuleChrome,
} from './dashboard-module-chrome'
import { DashboardTopbar } from './dashboard-topbar'
import { ProductTourProvider } from '@/components/tour/product-tour'
import { WelcomeTourDialog } from '@/components/tour/welcome-tour-dialog'

interface DashboardShellProps {
  children: React.ReactNode
  defaultSidebarOpen?: boolean
}

const QUICK_ACTIONS: Array<{
  group: string
  items: Array<{
    label: string
    href: string
    icon: React.ComponentType<{ className?: string }>
  }>
}> = [
  {
    group: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: Home },
      { label: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
      { label: 'Templates', href: '/dashboard/templates', icon: FileText },
      { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
      { label: 'Automations', href: '/dashboard/automations', icon: Zap },
      { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
    ],
  },
  {
    group: 'Tools',
    items: [
      { label: 'CPE Tracker', href: '/dashboard/cpe-tracker', icon: GraduationCap },
      { label: 'Form Fill', href: '/dashboard/form-fill', icon: Files },
      { label: 'PBC', href: '/dashboard/pbc', icon: ClipboardCheck },
      { label: 'Inkwise', href: '/dashboard/inkwise', icon: PenTool },
      {
        label: 'Tasklytic',
        href: '/dashboard/project-management',
        icon: FolderKanban,
      },
      { label: 'E-Signature', href: '/dashboard/esign', icon: FileSignature },
    ],
  },
]

export function DashboardShell({
  children,
  defaultSidebarOpen = true,
}: DashboardShellProps) {
  return (
    <DashboardModuleChromeProvider>
      <DashboardShellContent defaultSidebarOpen={defaultSidebarOpen}>
        {children}
      </DashboardShellContent>
    </DashboardModuleChromeProvider>
  )
}

function DashboardShellContent({
  children,
  defaultSidebarOpen = true,
}: DashboardShellProps) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const moduleChrome = useRegisteredDashboardModuleChrome()
  const isWideRoute =
    pathname.startsWith('/dashboard/cpe-tracker') ||
    pathname.startsWith('/dashboard/inkwise') ||
    pathname.startsWith('/dashboard/pbc') ||
    pathname.startsWith('/dashboard/project-management')
  const isImmersiveEsign =
    pathname.startsWith('/dashboard/esign/sign/') ||
    /\/dashboard\/esign\/[^/]+\/(prepare|fields|review|documents|recipients)$/.test(pathname) ||
    /\/dashboard\/esign\/templates\/[^/]+/.test(pathname)
  const isProjectManagement = pathname.startsWith('/dashboard/project-management')
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const openGlobalPalette = React.useCallback(() => setPaletteOpen(true), [])
  const openCommandPalette = React.useMemo(
    () => resolveDashboardCommandPalette(moduleChrome, openGlobalPalette),
    [moduleChrome, openGlobalPalette],
  )

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        openCommandPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCommandPalette])

  const runCommand = React.useCallback(
    (action: () => void) => {
      setPaletteOpen(false)
      action()
    },
    [],
  )

  if (isImmersiveEsign) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-dvh bg-surface outline-none">
        <ProductTourProvider>{children}</ProductTourProvider>
      </main>
    )
  }

  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      className={cn(isProjectManagement && 'h-svh max-h-svh overflow-hidden')}
    >
      <a
        href="#main-content"
        className={cn(
          'sr-only z-50 m-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
          'focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        Skip to content
      </a>

      <AppSidebar />

      <SidebarInset
        className={cn(
          'min-w-0 bg-surface',
          isProjectManagement && 'min-h-0 overflow-hidden',
        )}
      >
        <DashboardTopbar
          actions={moduleChrome?.actions}
          breadcrumbs={moduleChrome?.breadcrumbs}
          onOpenCommandPalette={openCommandPalette}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            'relative flex-1 outline-none focus-visible:outline-none',
            isProjectManagement && 'min-h-0 overflow-hidden',
          )}
        >
          <div
            className={cn(
              'w-full',
              isProjectManagement
                ? 'h-full min-h-0 max-w-none p-0'
                : 'mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
              !isProjectManagement && (isWideRoute ? 'max-w-none' : 'max-w-7xl'),
            )}
          >
            <ProductTourProvider>
              <WelcomeTourDialog />
              {children}
            </ProductTourProvider>
          </div>
        </main>
      </SidebarInset>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search the workspace…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {QUICK_ACTIONS.map((group, gi) => (
            <React.Fragment key={group.group}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={group.group}>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.href}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => runCommand(() => router.push(item.href))}
                    >
                      <Icon className="mr-2 size-4 text-foreground-muted" />
                      <span>{item.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  )
}
