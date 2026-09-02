'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  LifeBuoy,
  LogOut,
  Search,
  ShieldCheck,
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
import { useAuth } from '@/contexts/AuthContext'
import { useCurrentUser } from '@/hooks/useUserProfile'
import type { ProductCatalogItem } from '@/lib/product-catalog'

import { DashboardBreadcrumbs } from './dashboard-breadcrumbs'

interface DashboardTopbarProps {
  onOpenCommandPalette?: () => void
  breadcrumbs?: Array<{ label: string; href?: string }>
  actions?: React.ReactNode
  className?: string
  product?: ProductCatalogItem | null
}

export function DashboardTopbar({
  onOpenCommandPalette,
  breadcrumbs,
  actions,
  className,
  product,
}: DashboardTopbarProps) {
  const { user, signOut } = useAuth()
  const { user: profile } = useCurrentUser()
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
        'app-header sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4 lg:px-6',
        className,
      )}
    >
      <Link
        href="/"
        aria-label="CPAAutomation home"
        className="flex h-10 shrink-0 items-center rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Image src="/logo.png" alt="CPAAutomation" width={240} height={80} priority className="h-7 w-auto" />
      </Link>

      <div className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />

      {product ? (
        <Link
          href="/dashboard"
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground-muted transition-colors',
            'hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">All products</span>
        </Link>
      ) : null}

      <DashboardBreadcrumbs breadcrumbs={breadcrumbs} className="ml-2 hidden flex-1 xl:flex" />

      <div className="flex-1 xl:hidden" />

      {onOpenCommandPalette ? (
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
          className={cn(
            'group inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface-muted px-2.5 text-sm text-foreground-muted shadow-xs transition-colors',
            'hover:border-border-strong hover:bg-surface hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium tabular-nums text-foreground-subtle lg:inline-flex">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </button>
      ) : null}

      {actions ? (
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="Module actions">
          {actions}
        </div>
      ) : null}

      <DropdownMenu modal={false}>
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
          {profile?.is_system_admin && (
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer">
                <ShieldCheck className="mr-2 size-4" />
                Admin console
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings" className="cursor-pointer">
              <UserIcon className="mr-2 size-4" />
              Account
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
