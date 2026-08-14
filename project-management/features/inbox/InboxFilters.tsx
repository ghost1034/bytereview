'use client'

/** InboxFilters — view tabs, type chips, and bulk header actions. */
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Notification } from '../../types'
import { archiveAllRead, markAllRead } from '../../lib/notifications'
import type { InboxFilterTab, InboxViewTab } from './inboxTypes'
import { NOTIFICATION_TYPE_LABELS } from './inboxTypes'

type Props = {
  userId: string
  viewTab: InboxViewTab
  filterTab: InboxFilterTab
  typeFilters: Notification['type'][]
  onViewTab: (tab: InboxViewTab) => void
  onFilterTab: (tab: InboxFilterTab) => void
  onTypeFilters: (types: Notification['type'][]) => void
}

const FILTER_TABS: InboxFilterTab[] = ['all', 'unread', 'mentions', 'assigned']

const TYPE_OPTIONS = Object.entries(NOTIFICATION_TYPE_LABELS) as Array<
  [Notification['type'], string]
>

/** Header filters and quick actions above the notification list. */
export function InboxFilters({
  userId,
  viewTab,
  filterTab,
  typeFilters,
  onViewTab,
  onFilterTab,
  onTypeFilters,
}: Props) {
  const toggleType = (type: Notification['type']) => {
    if (typeFilters.includes(type)) {
      onTypeFilters(typeFilters.filter((t) => t !== type))
    } else {
      onTypeFilters([...typeFilters, type])
    }
  }

  return (
    <div className="space-y-3 border-b px-4 py-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={viewTab} onValueChange={(v) => onViewTab(v as InboxViewTab)}>
          <TabsList>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="archive">Archive</TabsTrigger>
            <TabsTrigger value="snoozed">Snoozed</TabsTrigger>
          </TabsList>
        </Tabs>
        {viewTab === 'inbox' ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => void markAllRead(userId)}>
              Mark all read
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => void archiveAllRead(userId)}>
              Archive all read
            </Button>
          </div>
        ) : null}
      </div>
      {viewTab === 'inbox' ? (
        <>
          <Tabs value={filterTab} onValueChange={(v) => onFilterTab(v as InboxFilterTab)}>
            <TabsList className="h-8">
              {FILTER_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="px-3 text-xs capitalize">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map(([type, label]) => {
              const active = typeFilters.includes(type)
              return (
                <button key={type} type="button" onClick={() => toggleType(type)}>
                  <Badge
                    variant={active ? 'default' : 'outline'}
                    className="cursor-pointer font-normal"
                    style={active ? { background: 'hsl(var(--primary))', color: 'hsl(var(--card))' } : undefined}
                  >
                    {label}
                  </Badge>
                </button>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
