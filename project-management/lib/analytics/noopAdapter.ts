import type { AnalyticsAdapter } from './types'

export const noopAnalyticsAdapter: AnalyticsAdapter = {
  capabilities: { provider: 'noop' },

  track() {
    // Silent no-op when no provider is bound.
  },

  identify() {},

  page() {},
}
