import { getAnalyticsAdapter } from './index'
import type { AnalyticsEvent, AnalyticsProperties } from './types'

/** Fire a product analytics event through the configured adapter. */
export function track(event: AnalyticsEvent | string, properties?: AnalyticsProperties): void {
  getAnalyticsAdapter().track(event, properties)
}

/** Identify the current user for analytics providers. */
export function identify(userId: string, traits?: AnalyticsProperties): void {
  getAnalyticsAdapter().identify(userId, traits)
}

/** Record a virtual page view. */
export function page(name: string, properties?: AnalyticsProperties): void {
  getAnalyticsAdapter().page(name, properties)
}
