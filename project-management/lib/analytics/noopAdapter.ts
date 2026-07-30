import type { AnalyticsAdapter, AnalyticsEvent, AnalyticsProperties } from './types'

export const noopAnalyticsAdapter: AnalyticsAdapter = {
  capabilities: { provider: 'noop' },

  track(_event: AnalyticsEvent | string, _properties?: AnalyticsProperties) {
    // Silent no-op when no provider is bound.
  },

  identify(_userId: string, _traits?: AnalyticsProperties) {},

  page(_name: string, _properties?: AnalyticsProperties) {},
}
