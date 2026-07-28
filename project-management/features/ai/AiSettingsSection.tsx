'use client'



/** AI settings — enable toggle and model select (server Vertex or local Gemini key). */

import { GEMINI_MODEL_OPTIONS, resolveGeminiApiKey, useAiSettingsStore } from '../../lib/ai'

import { usesTasklyticBackend } from '../../lib/forms/publicFormApi'

import { Input } from '@/components/ui/input'

import { Label } from '@/components/ui/label'

import { Switch } from '@/components/ui/switch'

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from '@/components/ui/select'



export function AiSettingsSection() {

  const serverMode = usesTasklyticBackend()

  const enabled = useAiSettingsStore((s) => s.enabled)

  const apiKey = useAiSettingsStore((s) => s.apiKey)

  const model = useAiSettingsStore((s) => s.model)

  const setEnabled = useAiSettingsStore((s) => s.setEnabled)

  const setApiKey = useAiSettingsStore((s) => s.setApiKey)

  const setModel = useAiSettingsStore((s) => s.setModel)

  const envKey = resolveGeminiApiKey('')



  return (

    <div className="space-y-4 p-4 text-sm">

      <p style={{ color: 'var(--ink-muted)' }}>

        {serverMode

          ? 'Tasklytic AI uses the same Google Vertex AI service as CPA Analytics. Workspace context is sent securely to the server — no API key required.'

          : 'Tasklytic AI sends necessary context to Gemini to generate responses. Keys are stored locally in your browser.'}

      </p>

      <div className="flex items-center justify-between gap-3">

        <Label htmlFor="ai-enabled">Enable AI</Label>

        <Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />

      </div>

      {!serverMode ? (

        <div className="space-y-1.5">

          <Label htmlFor="ai-key">Gemini API key</Label>

          <Input

            id="ai-key"

            type="password"

            placeholder={envKey ? 'Using env key (override optional)' : 'Paste Google AI Studio key'}

            value={apiKey}

            onChange={(e) => setApiKey(e.target.value)}

          />

        </div>

      ) : null}

      <div className="space-y-1.5">

        <Label>Model</Label>

        <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>

          <SelectTrigger>

            <SelectValue />

          </SelectTrigger>

          <SelectContent className="tl-popover-surface z-[100]">

            {GEMINI_MODEL_OPTIONS.map((o) => (

              <SelectItem key={o.id} value={o.id}>

                {o.label}

              </SelectItem>

            ))}

          </SelectContent>

        </Select>

      </div>

    </div>

  )

}

