'use client'

/**
 * Lightweight guided product tour — runs after onboarding; replayable from Help menu.
 */
import { useCallback, useEffect } from 'react'
import { GuidedTour } from '@/components/tour/guided-tour'
import { track } from '../../lib/analytics/track'
import { now } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { TOUR_STEPS } from './tourSteps'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

let externalStart: (() => void) | null = null

/** Register a tour launcher from the shell (Help menu, onboarding finish). */
export function startProductTour(): void {
  externalStart?.()
}

export function ProductTour({ open, onOpenChange }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const updateUser = useUsersStore((s) => s.update)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))

  const complete = useCallback(async () => {
    if (currentUserId && user) {
      await updateUser(currentUserId, {
        onboarding: {
          ...user.onboarding,
          completedSteps: user.onboarding?.completedSteps ?? [],
          tourCompletedAt: now(),
        },
      })
    }
    track('product_tour_completed', {})
  }, [currentUserId, updateUser, user])

  useEffect(() => {
    externalStart = () => {
      onOpenChange(true)
      track('product_tour_started', {})
    }
    return () => {
      externalStart = null
    }
  }, [onOpenChange])

  return (
    <GuidedTour
      open={open}
      onOpenChange={onOpenChange}
      steps={TOUR_STEPS}
      onComplete={complete}
      overlayProps={{
        layout: 'compact',
        rootClassName: 'z-[200]',
        backdropClassName: 'bg-black/30',
        highlightClassName: 'rounded-lg border-0 bg-transparent shadow-none ring-2 ring-[#cc785c]',
        panelClassName: 'tl-popover-surface max-h-[calc(100vh-2rem)] overflow-y-auto',
        primaryButtonClassName: 'border-0 bg-[#cc785c] text-white hover:bg-[#b05d40]',
        highlightPadding: 4,
        panelWidth: 320,
        panelHeight: 220,
        gap: 12,
        focusOnStep: true,
        blockInteraction: true,
        ariaModal: true,
      }}
    />
  )
}
