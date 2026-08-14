'use client'

/** MiniInboxDropdown — compact bell dropdown with latest notifications. */
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatRelative } from '../../lib/time'
import {
  getActiveInbox,
  getUnreadCount,
  markAllRead,
  markRead,
} from '../../lib/notifications'
import { useNotificationsStore } from '../../stores/entities'
import { UserAvatar } from '../profile/UserAvatar'
import { notificationTitle } from './notificationDisplay'

type Props = {
  userId: string
  workspaceId: string
  inboxHref: string
}

/** Topbar mini-inbox — latest seven notifications plus quick actions. */
export function MiniInboxDropdown({ userId, inboxHref }: Omit<Props, 'workspaceId'>) {
  useNotificationsStore((s) => s.list())
  const unread = getUnreadCount(userId)
  const latest = getActiveInbox(userId).slice(0, 7)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`relative rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background${unread > 0 ? ' ring-1 ring-primary' : ''}`}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-5 w-5" style={{ color: 'hsl(var(--foreground-muted))' }} />
          {unread > 0 ? (
            <span
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
              style={{ background: 'hsl(var(--destructive))' }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
            Notifications
          </span>
          {unread > 0 ? (
            <button
              type="button"
              className="text-xs hover:underline"
              style={{ color: 'hsl(var(--primary))' }}
              onClick={() => void markAllRead(userId)}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <ScrollArea className="max-h-72">
          {latest.length ? (
            latest.map((n) => (
              <DropdownMenuItem key={n.id} className="cursor-pointer p-0" asChild>
                <Link
                  href={`${inboxHref}?n=${n.id}`}
                  className="flex items-start gap-2 px-3 py-2"
                  onClick={() => void markRead(n.id)}
                >
                  {n.actorId ? (
                    <UserAvatar userId={n.actorId} size="sm" showPresence={false} />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--surface-muted))]">
                      <Bell className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`line-clamp-2 text-sm${n.unread ? ' font-medium' : ''}`}
                      style={{ color: 'hsl(var(--foreground))' }}
                    >
                      {notificationTitle(n)}
                    </span>
                    <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                      {formatRelative(n.createdAt)}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              You&apos;re all caught up.
            </p>
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="p-2">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href={inboxHref}>Open Inbox</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
