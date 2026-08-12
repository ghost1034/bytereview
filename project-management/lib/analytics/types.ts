/**
 * Analytics event names — extend as product surfaces grow.
 */
export type AnalyticsEvent =
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'task_deleted'
  | 'task_assigned'
  | 'due_date_changed'
  | 'form_submitted'
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_template_selected'
  | 'onboarding_completed'
  | 'project_created'
  | 'template_used'
  | 'product_tour_started'
  | 'product_tour_completed'

export type AnalyticsProperties = Record<string, string | number | boolean | string[] | null | undefined>

/** First-party usage-event seam. */
export interface AnalyticsAdapter {
  track(event: AnalyticsEvent | string, properties?: AnalyticsProperties): void
  identify(userId: string, traits?: AnalyticsProperties): void
  page(name: string, properties?: AnalyticsProperties): void
  readonly capabilities: {
    provider: 'noop' | 'first_party'
  }
}
