'use client'

import { useEffect, useState } from 'react'
import { usesTasklyticBackend } from '../../lib/forms/publicFormApi'
import { useAiSettingsStore } from '../../lib/ai'
import { loadAiSettings, loadAiThreads, migrateAiThreads } from '../../lib/ai/serverState'

export function usePersistentAiState(workspaceId: string | null, userId: string | null) {
  const replaceThreads = useAiSettingsStore((state) => state.replaceWorkspaceThreads)
  const setEnabled = useAiSettingsStore((state) => state.setEnabled)
  const setPaused = useAiSettingsStore((state) => state.setPaused)
  const setModel = useAiSettingsStore((state) => state.setModel)
  const setModelOptions = useAiSettingsStore((state) => state.setModelOptions)
  const [ready, setReady] = useState(!usesTasklyticBackend())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId || !userId || !usesTasklyticBackend()) return
    let cancelled = false
    const hydrate = async () => {
      setReady(false)
      setError(null)
      try {
        const settings = await loadAiSettings(workspaceId)
        let threads
        if (!settings.localThreadsMigrated) {
          const local = useAiSettingsStore.getState().listThreads(workspaceId)
          threads = (await migrateAiThreads(workspaceId, userId, local)).threads
        } else {
          threads = (await loadAiThreads(workspaceId)).threads
        }
        if (cancelled) return
        setEnabled(settings.enabled)
        setPaused(settings.paused)
        setModel(settings.model)
        setModelOptions(settings.models ?? [])
        replaceThreads(workspaceId, threads)
        setReady(true)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load AI history')
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [replaceThreads, setEnabled, setModel, setModelOptions, setPaused, userId, workspaceId])

  return { ready, error }
}
