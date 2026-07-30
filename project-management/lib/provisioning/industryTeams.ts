/**
 * Industry-aware default team sets for new workspaces.
 */
import type { ProvisioningTeamSpec } from './types'

const DEFAULT_TEAMS: ProvisioningTeamSpec[] = [
  { name: 'Design', iconEmoji: '🎨' },
  { name: 'Engineering', iconEmoji: '⚙️' },
  { name: 'Marketing', iconEmoji: '📣' },
  { name: 'Operations', iconEmoji: '🏢' },
]

const INDUSTRY_TEAMS: Record<string, ProvisioningTeamSpec[]> = {
  'Accounting / CPA': [
    { name: 'Tax', iconEmoji: '📋' },
    { name: 'Audit', iconEmoji: '🔍' },
    { name: 'Advisory', iconEmoji: '💡' },
    { name: 'Operations', iconEmoji: '🏢' },
  ],
  'Law firm': [
    { name: 'Litigation', iconEmoji: '⚖️' },
    { name: 'Corporate', iconEmoji: '🏛️' },
    { name: 'Transactional', iconEmoji: '📝' },
    { name: 'Operations', iconEmoji: '🏢' },
  ],
  Agency: DEFAULT_TEAMS,
  Engineering: [
    { name: 'Platform', iconEmoji: '🧱' },
    { name: 'Product', iconEmoji: '📦' },
    { name: 'QA', iconEmoji: '✅' },
    { name: 'Operations', iconEmoji: '🏢' },
  ],
  Finance: [
    { name: 'FP&A', iconEmoji: '📊' },
    { name: 'Accounting', iconEmoji: '📒' },
    { name: 'Treasury', iconEmoji: '💰' },
    { name: 'Operations', iconEmoji: '🏢' },
  ],
  Procurement: [
    { name: 'Strategic Sourcing', iconEmoji: '🎯' },
    { name: 'Vendor Management', iconEmoji: '🤝' },
    { name: 'Contracts', iconEmoji: '📄' },
    { name: 'Operations', iconEmoji: '🏢' },
  ],
  'HR / People': [
    { name: 'Talent Acquisition', iconEmoji: '🎯' },
    { name: 'People Operations', iconEmoji: '👥' },
    { name: 'Total Rewards', iconEmoji: '💎' },
    { name: 'L&D', iconEmoji: '📚' },
  ],
  'Corporate Development': [
    { name: 'Corp Dev', iconEmoji: '🤝' },
    { name: 'Integration Office', iconEmoji: '🔗' },
    { name: 'Tax', iconEmoji: '📋' },
    { name: 'Legal', iconEmoji: '⚖️' },
  ],
}

/** Resolve default teams for an industry chip selection. */
export function teamsForIndustry(industry?: string): ProvisioningTeamSpec[] {
  if (!industry) return DEFAULT_TEAMS
  return INDUSTRY_TEAMS[industry] ?? DEFAULT_TEAMS
}

/** Map industry to PSA mode when applicable. */
export function psaModeForIndustry(industry?: string): 'legal' | 'accounting' | 'advisory' | undefined {
  if (industry === 'Accounting / CPA') return 'accounting'
  if (industry === 'Law firm') return 'legal'
  if (industry === 'Corporate Development') return 'advisory'
  return undefined
}
