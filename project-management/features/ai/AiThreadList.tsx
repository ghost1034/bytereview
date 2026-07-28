'use client'

/** Thread switcher — multiple persistent chats per workspace. */
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAiSettingsStore } from '../../lib/ai'

type Props = {
  workspaceId: string
}

export function AiThreadList({ workspaceId }: Props) {
  const threads = useAiSettingsStore((s) => s.listThreads(workspaceId))
  const activeId = useAiSettingsStore((s) => s.activeThreadId)
  const setActive = useAiSettingsStore((s) => s.setActiveThread)
  const createThread = useAiSettingsStore((s) => s.createThread)

  return (
    <div className="flex items-center gap-1 border-b px-2 py-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {threads.slice(0, 6).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`max-w-[120px] truncate rounded-full px-2.5 py-1 text-xs ${
              t.id === activeId ? 'tl-btn-primary text-white' : ''
            }`}
            style={t.id === activeId ? undefined : { background: 'var(--bg-sunken)', color: 'var(--ink-muted)' }}
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
        onClick={() => createThread(workspaceId)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
