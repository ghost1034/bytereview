'use client'

/** Account dropdown — workspace settings, theme cycle, and sign out (delegated to ByteReview). */
import Link from 'next/link'
import { LogOut, Moon, Settings, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import type { TasklyticTheme } from '../../hooks/useTasklyticTheme'
import { UserAvatar } from './UserAvatar'

type Props = {
  theme?: TasklyticTheme
  onThemeCycle?: () => void
  compact?: boolean
}

export function AccountMenu({ theme = 'system', onThemeCycle, compact }: Props) {
  const user = useCurrentUser()
  const { workspaceId } = useWorkspaceContext()
  const { signOut } = useAuth()

  if (!user) return null

  const settingsHref = workspaceId
    ? `/dashboard/project-management/w/${workspaceId}/settings`
    : '/dashboard/project-management'

  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={compact ? 'h-auto gap-2 px-2 py-1.5' : 'h-9 w-9 rounded-full p-0'}>
          <UserAvatar userId={user.id} size={compact ? 'sm' : 'md'} />
          {compact ? (
            <span className="max-w-[120px] truncate text-sm font-medium">{user.name}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tl-popover-surface w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onThemeCycle}>
          {theme === 'dark' ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
          Theme: {themeLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
