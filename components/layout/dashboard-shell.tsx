'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Briefcase,
  FileText,
  Home,
  Plug,
  Settings as SettingsIcon,
  Zap,
  GraduationCap,
  Files,
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
import { DashboardTopbar } from './dashboard-topbar'
import { ProductTourProvider } from '@/components/tour/product-tour'

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
    ],
  },
]

export function DashboardShell({
  children,
  defaultSidebarOpen = true,
}: DashboardShellProps) {
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const runCommand = React.useCallback(
    (action: () => void) => {
      setPaletteOpen(false)
      action()
    },
    [],
  )

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
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

      <SidebarInset className="bg-surface">
        <DashboardTopbar onOpenCommandPalette={() => setPaletteOpen(true)} />

        <main
          id="main-content"
          tabIndex={-1}
          className="relative flex-1 outline-none focus-visible:outline-none"
        >
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <ProductTourProvider>{children}</ProductTourProvider>
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
