import { noopAnalyticsAdapter } from './noopAdapter'
import { serverAnalyticsAdapter } from './serverAdapter'
import { usesTasklyticBackend } from '../runtimeMode'
import type { AnalyticsAdapter } from './types'

let cached: AnalyticsAdapter | null = null

/**
 * Authenticated product events are stored by Tasklytic itself. Evaluation and
 * tests stay silent; no third-party analytics provider is advertised.
 */
export function getAnalyticsAdapter(): AnalyticsAdapter {
  if (cached) return cached

  cached = usesTasklyticBackend() ? serverAnalyticsAdapter : noopAnalyticsAdapter
  return cached
}

export type { AnalyticsAdapter, AnalyticsEvent, AnalyticsProperties } from './types'
