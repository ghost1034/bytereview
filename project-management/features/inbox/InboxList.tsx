'use client'

/** InboxList — grouped scrollable notification list. */
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Notification } from '../../types'
import { groupInboxNotifications } from './inboxGrouping'
import { InboxRow } from './InboxRow'

type Props = {
  notifications: Notification[]
  selectedId: string | null
  checked: Set<string>
  emptyMessage: string
  showSnoozedPill?: boolean
  onSelect: (id: string) => void
  onCheck: (id: string, value: boolean) => void
}

/** Scrollable list grouped by Today / Yesterday / This week / Earlier. */
export function InboxList({
  notifications,
  selectedId,
  checked,
  emptyMessage,
  showSnoozedPill,
  onSelect,
  onCheck,
}: Props) {
  if (!notifications.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-serif text-lg" style={{ color: 'var(--ink-primary)' }}>
          {emptyMessage}
        </p>
      </div>
    )
  }

  const groups = groupInboxNotifications(notifications)

  return (
    <ScrollArea className="flex-1">
      {groups.map((group) => (
        <section key={group.key}>
          <h3
            className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
            style={{ background: 'var(--bg-base)', color: 'var(--ink-muted)' }}
          >
            {group.label}
          </h3>
          {group.items.map((n) => (
            <InboxRow
              key={n.id}
              notification={n}
              active={selectedId === n.id}
              checked={checked.has(n.id)}
              showSnoozedPill={showSnoozedPill}
              onSelect={onSelect}
              onCheck={onCheck}
            />
          ))}
        </section>
      ))}
    </ScrollArea>
  )
}
