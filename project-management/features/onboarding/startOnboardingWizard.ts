'use client'

type OnboardingStarter = (opts?: { replay?: boolean }) => void

let externalStart: OnboardingStarter | null = null

/** Register the wizard launcher from TasklyticProvider. */
export function registerOnboardingWizardStarter(starter: OnboardingStarter | null): void {
  externalStart = starter
}

/** Open the onboarding wizard (optionally in replay mode). */
export function startOnboardingWizard(opts?: { replay?: boolean }): void {
  externalStart?.(opts)
}
