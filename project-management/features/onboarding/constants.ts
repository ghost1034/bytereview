/** Onboarding wizard step identifiers and option lists. */
export const ONBOARDING_STEPS = [
  'welcome',
  'about',
  'templates',
  'invite',
  'finish',
] as const

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]

export const TEAM_SIZES = ['1', '2-10', '11-50', '51-200', '201+'] as const

export const INDUSTRIES = [
  'General business',
  'Agency',
  'Engineering',
  'Accounting / CPA',
  'Law firm',
  'Finance',
  'Procurement',
  'HR / People',
  'Corporate Development',
  'Other',
] as const

export const USE_CASES = [
  'Project delivery',
  'Client work',
  'Team coordination',
  'Strategic planning',
  'Operations',
] as const

export const ROLES = [
  'Founder / Executive',
  'Project manager',
  'Team lead',
  'Individual contributor',
  'Operations',
] as const

export const STEP_LABELS: Record<OnboardingStepId, string> = {
  welcome: 'Welcome',
  about: 'About you',
  templates: 'Starter projects',
  invite: 'Invite team',
  finish: 'Finish',
}

export const MAX_INDUSTRY_SELECTIONS = 3
export const MAX_TEMPLATE_SELECTIONS = 3
