'use client'

/** Thread switcher — multiple persistent chats per workspace. */
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useAiSettingsStore } from '../../lib/ai'
import { usesTasklyticBackend } from '../../lib/forms/publicFormApi'
import { createServerThread } from '../../lib/ai/serverState'

type Props = {
  workspaceId: string
}

export function AiThreadList({ workspaceId }: Props) {
  const allThreads = useAiSettingsStore((s) => s.threads)
  const threads = useMemo(
    () => allThreads.filter((thread) => thread.workspaceId === workspaceId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allThreads, workspaceId],
  )
  const activeId = useAiSettingsStore((s) => s.activeThreadId)
  const setActive = useAiSettingsStore((s) => s.setActiveThread)
  const createThread = useAiSettingsStore((s) => s.createThread)
  const upsertThread = useAiSettingsStore((s) => s.upsertThread)

  const addThread = async () => {
    if (!usesTasklyticBackend()) {
      createThread(workspaceId)
      return
    }
    const created = await createServerThread(workspaceId)
    upsertThread(created)
    setActive(created.id)
  }

  return (
    <div className="flex items-center gap-1 border-b px-2 py-1.5" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {threads.slice(0, 6).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`max-w-[120px] truncate rounded-full px-2.5 py-1 text-xs ${
              t.id === activeId ? ' text-white' : ''
            }`}
            style={t.id === activeId ? undefined : { background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
          >
            {t.title}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label="New chat"
        onClick={() => void addThread()}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
