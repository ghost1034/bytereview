'use client'

/** AI panel header — aurora background, pause toggle, settings access. */
import { Pause, Play, Settings2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { resolveGeminiApiKey, useAiSettingsStore } from '../../lib/ai'

type Props = {
  onClose: () => void
  onOpenSettings: () => void
}

export function AiPanelHeader({ onClose, onOpenSettings }: Props) {
  const paused = useAiSettingsStore((s) => s.paused)
  const setPaused = useAiSettingsStore((s) => s.setPaused)
  const apiKey = useAiSettingsStore((s) => s.apiKey)
  const enabled = useAiSettingsStore((s) => s.enabled)
  const hasKey = Boolean(resolveGeminiApiKey(apiKey))
  const providerLabel = paused || !enabled ? 'Paused' : hasKey ? 'Gemini' : 'Local assistant'

  return (
    <header
      className="flex shrink-0 items-center justify-between border-b px-3 py-2.5 bg-aurora"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
        <div className="min-w-0">
          <p className="truncate font-serif text-sm font-medium">Tasklytic AI</p>
          <p className="truncate text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            {providerLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1.5 pr-1 text-[10px]" title="Pause AI">
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          <Switch checked={!paused} onCheckedChange={(v) => setPaused(!v)} aria-label="Pause AI" />
        </label>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings} aria-label="AI settings">
          <Settings2 className="h-4 w-4" />
        </Button>
        <button type="button" onClick={onClose} aria-label="Close AI panel" className="rounded-lg p-2 hover:bg-black/5">
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
