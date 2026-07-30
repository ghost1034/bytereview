import type { AnalyticsAdapter, AnalyticsEvent, AnalyticsProperties } from './types'

/** V1 adapter — logs events to the browser console for local debugging. */
export const consoleAnalyticsAdapter: AnalyticsAdapter = {
  capabilities: { provider: 'console' },

  track(event: AnalyticsEvent | string, properties?: AnalyticsProperties) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[analytics]', event, properties ?? {})
    }
  },

  identify(userId: string, traits?: AnalyticsProperties) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[analytics] identify', userId, traits ?? {})
    }
  },

  page(name: string, properties?: AnalyticsProperties) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[analytics] page', name, properties ?? {})
    }
  },
}
