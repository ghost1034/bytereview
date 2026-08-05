'use client'

/**
 * Lightweight guided product tour — runs after onboarding; replayable from Help menu.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { track } from '../../lib/analytics/track'
import { now } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { getTourPanelPosition } from './productTourPosition'
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
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
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
    onOpenChange(false)
  }, [currentUserId, onOpenChange, updateUser, user])

  useEffect(() => setMounted(true), [])

  const step = TOUR_STEPS[index]

  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null)
      return
    }

    let frame = 0
    let observedTarget: Element | null = null
    const resizeObserver = new ResizeObserver(() => scheduleUpdate())

    const findVisibleTarget = () => {
      const matches = Array.from(document.querySelectorAll(step.target))
      return (
        matches.find((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        }) ?? null
      )
    }

    const update = () => {
      const target = findVisibleTarget()
      if (target !== observedTarget) {
        resizeObserver.disconnect()
        observedTarget = target
        if (target) resizeObserver.observe(target)
      }
      setTargetRect(target?.getBoundingClientRect() ?? null)
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }

    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    scheduleUpdate()

    return () => {
      window.cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
  }, [open, step])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [index, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void complete()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [complete, open])

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

  if (!open || !mounted || !step) return null

  const position = getTourPanelPosition(targetRect, {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/30"
        aria-hidden="true"
      />
      {targetRect ? (
        <div
          className="pointer-events-none fixed z-[201] rounded-lg ring-2 ring-[#cc785c]"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      ) : null}
      <Card
        ref={dialogRef}
        className="tl-popover-surface fixed z-[202] max-h-[calc(100vh-2rem)] overflow-y-auto p-4 focus:outline-none"
        style={position}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        tabIndex={-1}
      >
        <p className="font-medium" style={{ color: 'var(--ink-primary)' }}>{step.title}</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => void complete()}>
            Skip
          </Button>
          <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
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
