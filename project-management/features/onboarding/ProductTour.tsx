'use client'

/**
 * Lightweight guided product tour — runs after onboarding; replayable from Help menu.
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  const [index, setIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const updateUser = useUsersStore((s) => s.update)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    externalStart = () => {
      setIndex(0)
      onOpenChange(true)
      track('product_tour_started', {})
    }
    return () => {
      externalStart = null
    }
  }, [onOpenChange])

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
    onOpenChange(false)
  }, [currentUserId, onOpenChange, updateUser, user])

  const step = TOUR_STEPS[index]
  const rect =
    mounted && step
      ? document.querySelector(step.target)?.getBoundingClientRect()
      : undefined

  if (!open || !mounted || !step) return null

  const top = rect ? rect.bottom + 8 : 80
  const left = rect ? Math.min(rect.left, window.innerWidth - 320) : 24

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/30"
        aria-label="Dismiss tour"
        role="button"
        tabIndex={-1}
        onClick={() => void complete()}
      />
      {rect ? (
        <div
          className="pointer-events-none fixed z-[201] rounded-lg ring-2 ring-[#cc785c]"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      ) : null}
      <Card
        className="fixed z-[202] w-80 bg-background p-4 text-foreground shadow-lg"
        style={{ top, left }}
        role="dialog"
        aria-label={step.title}
      >
        <p className="font-medium text-foreground">{step.title}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => void complete()}>
            Skip
          </Button>
          <span className="text-xs text-muted-foreground">
            {index + 1} / {TOUR_STEPS.length}
          </span>
          {index < TOUR_STEPS.length - 1 ? (
            <Button
              size="sm"
              className="border-0 bg-[#cc785c] text-white hover:bg-[#b05d40]"
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              className="border-0 bg-[#cc785c] text-white hover:bg-[#b05d40]"
              onClick={() => void complete()}
            >
              Done
            </Button>
          )}
        </div>
      </Card>
    </>,
    document.body
  )
}
