/**
 * AI adapter factory — server Vertex proxy (backend mode), in-browser Gemini, or local fallback.
 */
import { usesTasklyticBackend } from '../forms/publicFormApi'
import { createGeminiAdapter } from './geminiAdapter'
import { localFallbackAdapter } from './localFallbackAdapter'
import { createServerAiAdapter } from './serverAdapter'
import { resolveGeminiApiKey, useAiSettingsStore } from './settingsStore'
import type { AiAdapter } from './types'

const pausedAdapter: AiAdapter = {
  capabilities: { provider: 'local_fallback' },
  async generate() {
    return {
      text: 'Project Management AI is paused. Turn it back on from the panel header.',
      proposals: [],
    }
  },
}

/** Returns the active AI adapter based on settings and available API key. */
export function getAiAdapter(): AiAdapter {
  const { enabled, paused, apiKey, model } = useAiSettingsStore.getState()
  if (!enabled || paused) return pausedAdapter

  if (usesTasklyticBackend()) {
    return createServerAiAdapter(model)
  }

  const key = resolveGeminiApiKey(apiKey)
  if (key) return createGeminiAdapter(key, model)

  return localFallbackAdapter
}

export type { AiAdapter, AiGenerateInput, AiGenerateResult, AiProposal, AiContextBundle, AiContextScope } from './types'
export { useAiSettingsStore, resolveGeminiApiKey } from './settingsStore'
export { GEMINI_MODEL_OPTIONS } from './types'
