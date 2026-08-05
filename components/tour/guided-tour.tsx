'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getTourPanelPosition } from '@/components/tour/tour-position'
import { cn } from '@/lib/utils'

export type GuidedTourStep = {
  id: string
  title: string
  body: string
  target?: string
  nextLabel?: string
  manual?: boolean
}

type GuidedTourOverlayProps = {
  step: GuidedTourStep
  stepIndex: number
  totalSteps: number
  onBack?: () => void
  onNext: () => void
  onEnd: () => void
  layout?: 'standard' | 'compact'
  rootClassName?: string
  backdropClassName?: string
  highlightClassName?: string
  panelClassName?: string
  primaryButtonClassName?: string
  highlightPadding?: number
  panelWidth?: number
  panelHeight?: number
  gap?: number
  focusOnStep?: boolean
  blockInteraction?: boolean
  ariaModal?: boolean
}

function useTourTargetRect(selector: string | undefined, stepId: string) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const [found, setFound] = React.useState(false)

  React.useEffect(() => {
    if (!selector) {
      setRect(null)
      setFound(false)
      return
    }

    let frame = 0
    let observedTarget: Element | null = null
    const resizeObserver = new ResizeObserver(scheduleUpdate)

    const findVisibleTarget = () => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector))
      return matches.find((element) => {
        const nextRect = element.getBoundingClientRect()
        return nextRect.width > 0 && nextRect.height > 0
      }) ?? null
    }

    function update() {
      const target = findVisibleTarget()
      if (target !== observedTarget) {
        resizeObserver.disconnect()
        observedTarget = target
        if (target) resizeObserver.observe(target)
      }
      setFound(Boolean(target))
      setRect(target?.getBoundingClientRect() ?? null)
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }

    const scrollToTarget = window.setTimeout(() => {
      findVisibleTarget()?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
      scheduleUpdate()
    }, 100)
    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    scheduleUpdate()

    return () => {
      window.clearTimeout(scrollToTarget)
      window.cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
  }, [selector, stepId])

  return { rect, found }
}

/** Shared tour overlay used by CPAAutomation's product-specific tour definitions. */
export function GuidedTourOverlay({
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onEnd,
  layout = 'standard',
  rootClassName,
  backdropClassName,
  highlightClassName,
  panelClassName,
  primaryButtonClassName,
  highlightPadding = 6,
  panelWidth,
  panelHeight,
  gap,
  focusOnStep = false,
  blockInteraction = false,
  ariaModal = false,
}: GuidedTourOverlayProps) {
  const panelRef = React.useRef<HTMLElement>(null)
  const { rect, found } = useTourTargetRect(step.target, step.id)
  const position = getTourPanelPosition(rect, {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    panelWidth,
    panelHeight,
    gap,
  })

  React.useEffect(() => {
    if (!focusOnStep) return
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [focusOnStep, step.id])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onEnd()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onEnd])

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[80]',
        blockInteraction ? 'pointer-events-auto' : 'pointer-events-none',
        rootClassName,
      )}
      aria-live="polite"
    >
      <div className={cn('absolute inset-0 bg-slate-950/20', backdropClassName)} aria-hidden="true" />

      {rect && (
        <div
          className={cn(
            'pointer-events-none absolute rounded-xl border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.25)] transition-all',
            highlightClassName,
          )}
          style={{
            left: rect.left - highlightPadding,
            top: rect.top - highlightPadding,
            width: rect.width + highlightPadding * 2,
            height: rect.height + highlightPadding * 2,
          }}
        />
      )}

      <section
        ref={panelRef}
        role="dialog"
        aria-modal={ariaModal}
        aria-label={layout === 'compact' ? step.title : 'Product tour'}
        tabIndex={focusOnStep ? -1 : undefined}
        className={cn(
          'pointer-events-auto absolute rounded-xl border border-border bg-background p-4 shadow-xl focus:outline-none',
          panelClassName,
        )}
        style={position}
      >
        {layout === 'standard' ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  Tour step {stepIndex + 1} of {totalSteps}
                </p>
                <h2 className="mt-1 text-base font-semibold text-foreground">{step.title}</h2>
              </div>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-2 size-8" onClick={onEnd} aria-label="End tour">
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            <p className="mt-3 text-sm leading-6 text-foreground-muted">{step.body}</p>

            {step.target && !found && (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted">
                Waiting for this part of the page to load.
              </p>
            )}

            {step.manual && (
              <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                Complete the highlighted action to continue the tour automatically.
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={onEnd}>Skip tour</Button>
              <div className="flex items-center gap-2">
                {onBack && (
                  <Button variant="outline" size="sm" onClick={onBack} disabled={stepIndex === 0}>Back</Button>
                )}
                {!step.manual && (
                  <Button size="sm" className={primaryButtonClassName} onClick={onNext}>
                    {step.nextLabel || (stepIndex === totalSteps - 1 ? 'Finish tour' : 'Next')}
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="font-medium" style={{ color: 'var(--ink-primary)' }}>{step.title}</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>{step.body}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={onEnd}>Skip</Button>
              <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                {stepIndex + 1} / {totalSteps}
              </span>
              <Button size="sm" className={primaryButtonClassName} onClick={onNext}>
                {step.nextLabel || (stepIndex === totalSteps - 1 ? 'Done' : 'Next')}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}

type GuidedTourProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  steps: GuidedTourStep[]
  onComplete?: () => void | Promise<void>
  overlayProps?: Omit<
    GuidedTourOverlayProps,
    'step' | 'stepIndex' | 'totalSteps' | 'onBack' | 'onNext' | 'onEnd'
  >
}

/** Simple ordered tour controller for tours that do not navigate between routes. */
export function GuidedTour({
  open,
  onOpenChange,
  steps,
  onComplete,
  overlayProps,
}: GuidedTourProps) {
  const [mounted, setMounted] = React.useState(false)
  const [stepIndex, setStepIndex] = React.useState(0)
  const completingRef = React.useRef(false)

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    if (!open) setStepIndex(0)
  }, [open])

  const endTour = React.useCallback(async () => {
    if (completingRef.current) return
    completingRef.current = true
    try {
      await onComplete?.()
      onOpenChange(false)
    } finally {
      completingRef.current = false
    }
  }, [onComplete, onOpenChange])

  const next = React.useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      void endTour()
      return
    }
    setStepIndex((current) => current + 1)
  }, [endTour, stepIndex, steps.length])

  const step = steps[stepIndex]
  if (!mounted || !open || !step) return null

  return (
    <GuidedTourOverlay
      {...overlayProps}
      step={step}
      stepIndex={stepIndex}
      totalSteps={steps.length}
      onNext={next}
      onEnd={() => void endTour()}
    />
  )
}
