'use client'

import { Pin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { projectMessagePermalink } from '../../lib/projectMessages'
import { formatRelative } from '../../lib/time'
import { tasklyticToast } from '../ui/tasklyticToast'
import type { ProjectMessage, User } from '../../types'

type Props = {
  messages: ProjectMessage[]
  selectedId: string | null
  onSelect: (id: string) => void
  userById: Map<string, User>
  basePath: string
}

/** Left column list of project messages (pinned announcements first). */
export function MessageList({ messages, selectedId, onSelect, userById, basePath }: Props) {
  const pinned = messages.filter((m) => m.isAnnouncement)
  const regular = messages.filter((m) => !m.isAnnouncement)

  const copyPermalink = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const path = projectMessagePermalink(basePath, messageId)
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
    try {
      await navigator.clipboard.writeText(url)
      tasklyticToast('Link copied', { status: 'success' })
    } catch {
      tasklyticToast('Could not copy link', { status: 'error' })
    }
  }

  const renderRow = (message: ProjectMessage) => {
    const active = message.id === selectedId
    const author = userById.get(message.authorId)
    return (
      <button
        key={message.id}
        type="button"
        className="w-full rounded-lg p-3 text-left text-sm transition-colors"
        style={{
          background: active ? 'var(--accent-soft)' : 'var(--bg-muted)',
          border: active ? '1px solid var(--accent)' : '1px solid transparent',
        }}
        onClick={() => onSelect(message.id)}
      >
        <div className="flex items-start gap-2">
          {message.isAnnouncement ? (
            <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{message.title}</p>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              {author?.name ?? 'Unknown'} · {formatRelative(message.createdAt)}
              {message.editedAt ? ' · edited' : ''}
            </p>
            {message.comments.length ? (
              <Badge variant="secondary" className="mt-1 text-xs">
                {message.comments.length} comment{message.comments.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>
        <span
          role="link"
          tabIndex={0}
          className="mt-1 inline-block text-xs underline"
          style={{ color: 'var(--ink-muted)' }}
          onClick={(e) => void copyPermalink(message.id, e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              void copyPermalink(message.id, e as unknown as React.MouseEvent)
            }
          }}
        >
          Copy link
        </span>
      </button>
    )
  }

  if (!messages.length) {
    return (
      <p className="p-4 text-sm" style={{ color: 'var(--ink-muted)' }}>
        No messages yet. Start the conversation.
      </p>
    )
  }

  return (
    <div className="space-y-4 p-2">
      {pinned.length ? (
        <section>
          <p className="mb-2 px-1 text-xs font-medium uppercase" style={{ color: 'var(--ink-muted)' }}>
            Announcements
          </p>
          <div className="space-y-2">{pinned.map(renderRow)}</div>
        </section>
      ) : null}
      <section>
        {pinned.length ? (
          <p className="mb-2 px-1 text-xs font-medium uppercase" style={{ color: 'var(--ink-muted)' }}>
            Messages
          </p>
        ) : null}
        <div className="space-y-2">{regular.map(renderRow)}</div>
      </section>
    </div>
  )
}
