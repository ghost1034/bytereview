import { consoleAnalyticsAdapter } from './consoleAdapter'
import { noopAnalyticsAdapter } from './noopAdapter'
import type { AnalyticsAdapter } from './types'

let cached: AnalyticsAdapter | null = null

/**
 * Returns the configured analytics adapter.
 * V1: console in development; noop in production unless configured.
 * Production swap-out: set NEXT_PUBLIC_ANALYTICS_ADAPTER=segment|mixpanel|amplitude|posthog
 * plus provider-specific write keys (e.g. NEXT_PUBLIC_SEGMENT_WRITE_KEY).
 */
export function getAnalyticsAdapter(): AnalyticsAdapter {
  if (cached) return cached

  const provider =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ANALYTICS_ADAPTER : undefined

  if (provider === 'noop') {
    cached = noopAnalyticsAdapter
    return cached
  }

  // V1 default: console logging in dev, noop in production builds.
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
  cached = isDev ? consoleAnalyticsAdapter : noopAnalyticsAdapter
  return cached
}

export type { AnalyticsAdapter, AnalyticsEvent, AnalyticsProperties } from './types'
