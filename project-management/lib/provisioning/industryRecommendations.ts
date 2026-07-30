/**
 * Industry → recommended starter template IDs from the 34-template library.
 */
import type { ID } from '../../types'

const RECOMMENDATIONS: Record<string, ID[]> = {
  'General business': ['a1-qbr', 'a2-b2b-onboarding', 'a4-strategic-planning'],
  Agency: ['a1-qbr', 'a2-b2b-onboarding', 'curated-marketing-campaign'],
  Engineering: ['curated-engineering-sprint', 'curated-bug-tracker', 'a4-strategic-planning'],
  'Accounting / CPA': ['b1-month-end-close', 'b3-form-1040', 'b4-audit-engagement'],
  'Law firm': ['c1-matter-intake', 'c2-litigation', 'c3-contract-review'],
  Finance: ['d2-fpa-close', 'd1-annual-budget', 'd3-sox-404'],
  Procurement: ['e1-strategic-sourcing', 'e2-vendor-onboarding', 'e3-contract-renewal'],
  'HR / People': ['f1-talent-acquisition', 'f2-new-hire-onboarding', 'f3-performance-review'],
  'Corporate Development': ['g1-strategic-acquisition', 'g2-spinoff-divestiture', 'a4-strategic-planning'],
  Other: ['curated-product-launch', 'a1-qbr', 'curated-okr-planning'],
}

/** Return three recommended template IDs for one industry (falls back to general business). */
export function recommendedTemplatesForIndustry(industry?: string): ID[] {
  if (!industry) return RECOMMENDATIONS['General business']
  return RECOMMENDATIONS[industry] ?? RECOMMENDATIONS['General business']
}

/** Merge recommendations across up to three industries (deduped, ~3 per industry). */
export function recommendedTemplatesForIndustries(industries?: string[]): ID[] {
  const picks = industries?.length ? industries.slice(0, 3) : ['General business']
  const seen = new Set<ID>()
  const merged: ID[] = []
  for (const industry of picks) {
    for (const id of recommendedTemplatesForIndustry(industry)) {
      if (!seen.has(id)) {
        seen.add(id)
        merged.push(id)
      }
    }
  }
  return merged
}
