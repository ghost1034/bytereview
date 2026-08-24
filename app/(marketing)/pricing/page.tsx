import { Suspense } from 'react'
import { PricingClient } from '@/components/marketing/PricingClient'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.pricing)

const faqs = [
  ['Can I cancel my subscription at any time?', 'Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees.'],
  ['How does overage pricing work?', 'Pages and platform AI tokens have separate monthly allowances. Paid-plan overages use the page and per-1,000-token rates shown on the plan card; Free users must upgrade when either allowance is exhausted.'],
  ['Do you offer annual billing or discounts?', 'Yes. We can provide annual billing and volume discounts for teams with higher usage. Contact us if you’re interested in annual pricing or custom plans.'],
  ['What happens if I upgrade or downgrade?', 'Plan changes take effect immediately. If you upgrade, you get access to the higher plan’s limits right away. If you downgrade, new limits apply immediately and your next bill will reflect the new plan.'],
]

export default function PricingPage() { return <main id="main-content">
  <section className="ps-page-hero"><div className="ps-container ps-page-hero__split"><div><span className="ps-label">Pricing</span><h1>Pricing for teams of every size</h1></div><p className="ps-kicker">All plans are available month-to-month and you can cancel at any time.</p></div></section>
  <section className="ps-section ps-section--muted"><div className="ps-container"><Suspense fallback={<div className="ps-state-box">Loading plans…</div>}><PricingClient /></Suspense></div></section>
  <section className="ps-section"><div className="ps-narrow"><div className="ps-section-head"><div><h2>Pricing FAQ</h2></div></div><div className="ps-faq">{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></div></section>
</main> }
