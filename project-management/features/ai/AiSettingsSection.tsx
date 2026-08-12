'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAiSettingsStore } from '../../lib/ai'
import { saveAiSettings } from '../../lib/ai/serverState'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'

export function AiSettingsSection() {
  const { workspaceId } = useWorkspaceContext()
  const enabled = useAiSettingsStore((state) => state.enabled)
  const model = useAiSettingsStore((state) => state.model)
  const modelOptions = useAiSettingsStore((state) => state.modelOptions)
  const setEnabled = useAiSettingsStore((state) => state.setEnabled)
  const setModel = useAiSettingsStore((state) => state.setModel)
  const [error, setError] = useState<string | null>(null)

  const persist = async (patch: Parameters<typeof saveAiSettings>[1]) => {
    if (!workspaceId) return
    setError(null)
    try {
      await saveAiSettings(workspaceId, patch)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save AI settings')
    }
  }

  return (
    <div className="space-y-4 p-4 text-sm">
      <p style={{ color: 'var(--ink-muted)' }}>
        Tasklytic AI uses server-managed Google Vertex AI credentials. Only permission-checked workspace context is sent, and every proposed mutation requires your confirmation.
      </p>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="ai-enabled">Enable AI</Label>
        <Switch id="ai-enabled" checked={enabled} onCheckedChange={(next) => {
          setEnabled(next)
          void persist({ enabled: next })
        }} />
      </div>
      <div className="space-y-1.5">
        <Label>Vertex model</Label>
        <Select value={model} onValueChange={(next) => {
          const selected = next as typeof model
          setModel(selected)
          void persist({ model: selected })
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            {modelOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
