'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '../../stores/auth'
import { useProjectMessagesStore, useProjectsStore, useUsersStore } from '../../stores/entities'
import { MessageComposer } from './MessageComposer'
import { MessageList } from './MessageList'
import { MessageReader } from './MessageReader'

type Props = {
  projectId: string
  selectedMessageId?: string | null
  basePath: string
}

/** Project Messages tab — Slack-style list + reader with composer. */
export function ProjectMessages({ projectId, selectedMessageId, basePath }: Props) {
  const router = useRouter()
  const project = useProjectsStore((s) => s.getById(projectId))
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const messages = useProjectMessagesStore((s) =>
    s
      .list()
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const workspaceUsers = useUsersStore((s) => s.list().filter((u) => u.role !== 'guest'))
  const [selectedId, setSelectedId] = useState<string | null>(selectedMessageId ?? messages[0]?.id ?? null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editMessage, setEditMessage] = useState<(typeof messages)[0] | null>(null)

  useEffect(() => {
    if (selectedMessageId) setSelectedId(selectedMessageId)
  }, [selectedMessageId])

  useEffect(() => {
    if (selectedId && !messages.some((m) => m.id === selectedId)) {
      setSelectedId(messages[0]?.id ?? null)
    } else if (!selectedId && messages[0]) {
      setSelectedId(messages[0].id)
    }
  }, [messages, selectedId])

  const userById = useMemo(() => {
    const map = new Map<string, (typeof workspaceUsers)[0]>()
    workspaceUsers.forEach((u) => map.set(u.id, u))
    return map
  }, [workspaceUsers])

  const selected = messages.find((m) => m.id === selectedId)

  const selectMessage = (id: string) => {
    setSelectedId(id)
    router.replace(`${basePath}?view=messages&messageId=${id}`, { scroll: false })
  }

  const openEdit = () => {
    if (!selected) return
    setEditMessage(selected)
    setComposerOpen(true)
  }

  const handleComposerOpenChange = (open: boolean) => {
    setComposerOpen(open)
    if (!open) setEditMessage(null)
  }

  const handleDeleted = () => {
    const remaining = messages.filter((m) => m.id !== selectedId)
    const nextId = remaining[0]?.id ?? null
    setSelectedId(nextId)
    if (nextId) router.replace(`${basePath}?view=messages&messageId=${nextId}`, { scroll: false })
    else router.replace(`${basePath}?view=messages`, { scroll: false })
  }

  if (!project || !currentUserId) {
    return <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Unable to load messages.</p>
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'hsl(var(--border))' }}>
        <h2 className="font-sans text-lg">Project messages</h2>
        <Button
          size="sm"
          className=" border-0"
          onClick={() => {
            setEditMessage(null)
            setComposerOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> New message
        </Button>
      </div>

      <div className="grid min-h-[420px] lg:grid-cols-[320px_1fr]">
        <div className="overflow-y-auto border-r" style={{ borderColor: 'hsl(var(--border))' }}>
          <MessageList
            messages={messages}
            selectedId={selectedId}
            onSelect={selectMessage}
            userById={userById}
            basePath={basePath}
          />
        </div>
        <div className="overflow-y-auto">
          {selected ? (
            <MessageReader
              message={selected}
              author={userById.get(selected.authorId)}
              userById={userById}
              workspaceUsers={workspaceUsers}
              currentUserId={currentUserId}
              basePath={basePath}
              onEdit={openEdit}
              onDeleted={handleDeleted}
            />
          ) : (
            <p className="p-8 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              Select a message or create a new one.
            </p>
          )}
        </div>
      </div>

      <MessageComposer
        project={project}
        currentUserId={currentUserId}
        open={composerOpen}
        onOpenChange={handleComposerOpenChange}
        editMessage={editMessage}
        onPosted={(id) => selectMessage(id)}
      />
    </div>
  )
}
