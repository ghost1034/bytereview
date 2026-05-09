'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  LifeBuoy,
  LogOut,
  Search,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAuth } from '@/contexts/AuthContext'

import { DashboardBreadcrumbs } from './dashboard-breadcrumbs'

interface DashboardTopbarProps {
  onOpenCommandPalette?: () => void
  className?: string
}

export function DashboardTopbar({
  onOpenCommandPalette,
  className,
}: DashboardTopbarProps) {
  const { user, signOut } = useAuth()
  const router = useRouter()

  const initials = React.useMemo(() => {
    const name = user?.displayName || user?.email || ''
    if (!name) return 'U'
    const parts = name.split(/[@\s.]+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ''
    const second = parts[1]?.[0] ?? ''
    return (first + second).toUpperCase() || name[0]?.toUpperCase() || 'U'
  }, [user])

  const handleSignOut = React.useCallback(async () => {
    await signOut()
    router.push('/')
  }, [signOut, router])

  return (
    <header
      className={cn(
        'app-header sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4',
        className,
      )}
    >
      <SidebarTrigger
        className="size-9 text-foreground-muted hover:text-foreground"
        aria-label="Toggle sidebar"
      />

      <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />

      <DashboardBreadcrumbs className="hidden flex-1 sm:flex" />

      {/* Spacer on mobile (breadcrumbs hidden) */}
      <div className="flex-1 sm:hidden" />

      {/* Command palette trigger */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        aria-label="Open command palette"
        className={cn(
          'group inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-muted px-2.5 text-sm text-foreground-muted shadow-xs transition-colors',
          'hover:border-border-strong hover:bg-surface hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium tabular-nums text-foreground-subtle md:inline-flex">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className={cn(
              'flex size-9 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary-soft-foreground transition-colors',
              'hover:bg-primary-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {user?.displayName || 'Signed in'}
            </span>
            {user?.email && (
              <span className="truncate text-xs font-normal text-foreground-muted">
                {user.email}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings" className="cursor-pointer">
              <UserIcon className="mr-2 size-4" />
              Account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings" className="cursor-pointer">
              <SettingsIcon className="mr-2 size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/contact" className="cursor-pointer">
              <LifeBuoy className="mr-2 size-4" />
              Support
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              void handleSignOut()
            }}
            className="cursor-pointer text-foreground-muted focus:text-foreground"
          >
            <LogOut className="mr-2 size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
