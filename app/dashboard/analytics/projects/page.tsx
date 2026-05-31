import { redirect } from 'next/navigation'

/** CPAAnalytics has no separate Projects module — work lives in each module's list + dashboard. */
export default function AnalyticsProjectsRedirectPage() {
  redirect('/dashboard/analytics')
}
