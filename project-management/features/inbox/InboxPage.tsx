'use client'

/** InboxPage — two-pane notifications inbox with filters, preview, and bulk actions. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useNotificationsStore } from '../../stores/entities'
import type { Notification } from '../../types'
import {
  getActiveInbox,
  getArchivedInbox,
  getSnoozedInbox,
  markRead,
  refreshExpiredSnoozes,
} from '../../lib/notifications'
import { InboxBulkBar } from './InboxBulkBar'
import { InboxFilters } from './InboxFilters'
import { InboxList } from './InboxList'
import { InboxPreviewPane } from './InboxPreviewPane'
import type { InboxFilterTab, InboxViewTab } from './inboxTypes'

function applyFilterTab(items: Notification[], tab: InboxFilterTab): Notification[] {
  if (tab === 'unread') return items.filter((n) => n.unread)
  if (tab === 'mentions') return items.filter((n) => n.type === 'mention')
  if (tab === 'assigned') return items.filter((n) => n.type === 'assigned')
  return items
}

/** Full inbox experience — list, filters, preview, archive, and snooze. */
export function InboxPage() {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const searchParams = useSearchParams()
  useNotificationsStore((s) => s.list())

  const [viewTab, setViewTab] = useState<InboxViewTab>('inbox')
  const [filterTab, setFilterTab] = useState<InboxFilterTab>('all')
  const [typeFilters, setTypeFilters] = useState<Notification['type'][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  usePageMeta({
    breadcrumbs: workspaceId
      ? [{ label: 'Project Management', href: `/dashboard/project-management/w/${workspaceId}/home` }, { label: 'Inbox' }]
      : [{ label: 'Inbox' }],
  })

  useEffect(() => {
    if (currentUserId) void refreshExpiredSnoozes(currentUserId)
    const timer = window.setInterval(() => {
      if (currentUserId) void refreshExpiredSnoozes(currentUserId)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [currentUserId])

  const notificationItems = useNotificationsStore((s) => s.items)

  const baseItems = useMemo(() => {
    if (!currentUserId) return []
    if (viewTab === 'archive') return getArchivedInbox(currentUserId)
    if (viewTab === 'snoozed') return getSnoozedInbox(currentUserId)
    return getActiveInbox(currentUserId)
  }, [currentUserId, viewTab, notificationItems])

  const filteredItems = useMemo(() => {
    let list = baseItems
    if (viewTab === 'inbox') {
      list = applyFilterTab(list, filterTab)
      if (typeFilters.length) list = list.filter((n) => typeFilters.includes(n.type))
    }
    return list
  }, [baseItems, filterTab, typeFilters, viewTab])

  const selected = useMemo(
    () => filteredItems.find((n) => n.id === selectedId) ?? filteredItems[0] ?? null,
    [filteredItems, selectedId]
  )

  useEffect(() => {
    const paramId = searchParams.get('n')
    if (paramId) setSelectedId(paramId)
  }, [searchParams])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    void markRead(id)
  }, [])

  const handleCheck = useCallback((id: string, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const emptyMessage =
    viewTab === 'archive'
      ? 'Nothing archived yet.'
      : viewTab === 'snoozed'
        ? 'No snoozed notifications.'
        : "You're all caught up. New activity lands here."

  if (!currentUserId) return null

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col">
      <div className="border-b px-4 py-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink-primary)' }}>
          Inbox
        </h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className="relative flex min-h-0 w-full flex-col lg:w-[440px] lg:shrink-0 lg:border-r"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <InboxFilters
            userId={currentUserId}
            viewTab={viewTab}
            filterTab={filterTab}
            typeFilters={typeFilters}
            onViewTab={(tab) => {
              setViewTab(tab)
              setChecked(new Set())
              setSelectedId(null)
            }}
            onFilterTab={setFilterTab}
            onTypeFilters={setTypeFilters}
          />
          <InboxList
            notifications={filteredItems}
            selectedId={selected?.id ?? null}
            checked={checked}
            emptyMessage={emptyMessage}
            showSnoozedPill={viewTab === 'snoozed'}
            onSelect={handleSelect}
            onCheck={handleCheck}
          />
          <InboxBulkBar userId={currentUserId} selected={checked} onClear={() => setChecked(new Set())} />
        </div>
        <div className="hidden min-h-0 flex-1 lg:block" style={{ background: 'var(--bg-base)' }}>
          <InboxPreviewPane workspaceId={workspaceId ?? ''} notification={selected} />
        </div>
      </div>
    </div>
  )
}
