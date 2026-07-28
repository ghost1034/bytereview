'use client'

/**
 * Reset onboarding progress and reopen the setup wizard (replay mode).
 */
import { useUsersStore } from '../../stores/entities'
import { startOnboardingWizard } from './startOnboardingWizard'

/** Clear onboarding completion flags so the wizard can run again. */
export async function resetOnboardingState(userId: string): Promise<void> {
  const users = useUsersStore.getState()
  const user = users.getById(userId)
  if (!user) return

  await users.update(userId, {
    onboarding: {
      completed: false,
      completedSteps: [],
      completedAt: undefined,
      skippedAt: undefined,
      tourCompletedAt: user.onboarding?.tourCompletedAt,
      checklist: user.onboarding?.checklist,
    },
  })
}

/** Restart the full setup wizard from step 1. */
export async function restartOnboardingWizard(userId: string): Promise<void> {
  await resetOnboardingState(userId)
  startOnboardingWizard({ replay: true })
}
