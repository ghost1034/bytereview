'use client'

/** InboxRow — single notification row with avatar, actions, and selection. */
import { Archive, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { formatRelative } from '../../lib/time'
import { archive, markRead, markUnread, unsnooze } from '../../lib/notifications'
import type { Notification } from '../../types'
import { UserAvatar } from '../profile/UserAvatar'
import {
  notificationScopeMeta,
  notificationTitle,
} from './notificationDisplay'
import { SnoozeMenu } from './SnoozeMenu'

type Props = {
  notification: Notification
  active: boolean
  checked: boolean
  showSnoozedPill?: boolean
  onSelect: (id: string) => void
  onCheck: (id: string, value: boolean) => void
}

/** One notification in the inbox list. */
export function InboxRow({
  notification,
  active,
  checked,
  showSnoozedPill,
  onSelect,
  onCheck,
}: Props) {
  const { resourceName, breadcrumb } = notificationScopeMeta(notification)
  const title = notificationTitle(notification)

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-start gap-3 border-b px-3 py-3 transition-colors',
        active && 'bg-[hsl(var(--surface-muted))]'
      )}
      style={{ borderColor: 'hsl(var(--border))' }}
      onClick={() => onSelect(notification.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(notification.id)
      }}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheck(notification.id, v === true)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select notification"
      />
      <span className="relative shrink-0">
        {notification.actorId ? (
          <UserAvatar userId={notification.actorId} size="sm" showPresence={false} />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'hsl(var(--surface-muted))' }}
          >
            <Bell className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            className={cn('truncate text-sm', notification.unread && 'font-medium')}
            style={{ color: 'hsl(var(--foreground))' }}
          >
            {title}
          </p>
          {notification.unread ? (
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: 'hsl(var(--success))' }}
              aria-label="Unread"
            />
          ) : null}
        </div>
        <p className="truncate text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {resourceName}
          {breadcrumb ? ` · ${breadcrumb}` : ''}
        </p>
        {showSnoozedPill && notification.snoozedUntil ? (
          <Badge variant="outline" className="mt-1 text-[10px]">
            Snoozed until {formatRelative(notification.snoozedUntil)}
          </Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs whitespace-nowrap" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {formatRelative(notification.createdAt)}
        </span>
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {notification.unread ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                void markRead(notification.id)
              }}
            >
              Read
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                void markUnread(notification.id)
              }}
            >
              Unread
            </Button>
          )}
          {showSnoozedPill ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                void unsnooze(notification.id)
              }}
            >
              Unsnooze
            </Button>
          ) : (
            <span onClick={(e) => e.stopPropagation()}>
              <SnoozeMenu notificationId={notification.id} />
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            aria-label="Archive"
            onClick={(e) => {
              e.stopPropagation()
              void archive(notification.id)
            }}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
