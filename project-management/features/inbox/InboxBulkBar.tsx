'use client'

/** InboxBulkBar — sticky footer for multi-selected notification actions. */
import { Archive, Check, Clock, Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  archive,
  markAllRead,
  markRead,
  markUnread,
  snoozePresetLaterToday,
  snooze,
} from '../../lib/notifications'
import { SnoozeMenu } from './SnoozeMenu'

type Props = {
  userId: string
  selected: Set<string>
  onClear: () => void
}

/** Floating bulk action bar when notifications are checked. */
export function InboxBulkBar({ userId, selected, onClear }: Props) {
  const ids = [...selected]
  if (!ids.length) return null

  const runAll = async (fn: (id: string) => Promise<void>) => {
    await Promise.all(ids.map(fn))
    onClear()
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-wrap items-center gap-2 border-t px-4 py-2"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
    >
      <span className="text-sm font-medium" style={{ color: 'var(--ink-primary)' }}>
        {ids.length} selected
      </span>
      <Button size="sm" variant="outline" onClick={() => void runAll(markRead)}>
        <Check className="mr-1 h-4 w-4" /> Mark read
      </Button>
      <Button size="sm" variant="outline" onClick={() => void runAll(markUnread)}>
        <Mail className="mr-1 h-4 w-4" /> Mark unread
      </Button>
      <Button size="sm" variant="outline" onClick={() => void runAll(archive)}>
        <Archive className="mr-1 h-4 w-4" /> Archive
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void runAll((id) => snooze(id, snoozePresetLaterToday()))}
      >
        <Clock className="mr-1 h-4 w-4" /> Snooze
      </Button>
      <SnoozeMenu
        notificationId={ids[0] ?? ''}
        onSnoozed={onClear}
        trigger={
          <Button size="sm" variant="outline">
            Custom snooze…
          </Button>
        }
      />
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="mr-1 h-4 w-4" /> Clear
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto text-xs"
        onClick={() => void markAllRead(userId).then(onClear)}
      >
        Mark all read
      </Button>
    </div>
  )
}
