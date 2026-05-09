'use client'

import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface Step {
  id: string
  label: string
  description?: string
  href?: string
}

interface StepIndicatorProps {
  steps: Step[]
  /** Index (0-based) of the current step */
  currentStep: number
  /** When provided, completed-step labels become links */
  onStepSelect?: (index: number, step: Step) => void
  className?: string
  /** Force compact (mobile-style) layout */
  compact?: boolean
}

export function StepIndicator({
  steps,
  currentStep,
  onStepSelect,
  className,
  compact,
}: StepIndicatorProps) {
  const total = steps.length
  const safeCurrent = Math.max(0, Math.min(currentStep, total - 1))
  const current = steps[safeCurrent]

  return (
    <nav
      aria-label="Workflow steps"
      className={cn('w-full', className)}
    >
      {/* Mobile / compact: single line summary */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 shadow-xs',
          compact ? 'flex' : 'sm:hidden',
        )}
      >
        <span
          className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden
        >
          {safeCurrent + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
            Step {safeCurrent + 1} of {total}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {current?.label}
          </p>
        </div>
      </div>

      {/* Desktop: full horizontal stepper */}
      {!compact && (
        <ol className="hidden items-stretch gap-1 sm:flex">
          {steps.map((step, idx) => {
            const isComplete = idx < safeCurrent
            const isCurrent = idx === safeCurrent
            const isClickable =
              !!onStepSelect && (isComplete || isCurrent)
            return (
              <li
                key={step.id}
                className={cn(
                  'relative flex flex-1 flex-col gap-2 pt-1',
                )}
              >
                {/* Connector */}
                {idx < total - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-1/2 top-4 -ml-px h-px w-full',
                      isComplete ? 'bg-primary' : 'bg-border',
                    )}
                  />
                )}
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={
                    isClickable ? () => onStepSelect?.(idx, step) : undefined
                  }
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'group relative z-10 flex flex-col items-center gap-2 rounded-md text-center',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isClickable
                      ? 'cursor-pointer'
                      : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                      isComplete &&
                        'border-primary bg-primary text-primary-foreground',
                      isCurrent &&
                        'border-primary bg-background text-foreground ring-2 ring-primary/15',
                      !isComplete &&
                        !isCurrent &&
                        'border-border bg-surface-raised text-foreground-subtle',
                    )}
                  >
                    {isComplete ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span className="space-y-0.5">
                    <span
                      className={cn(
                        'block text-xs font-medium',
                        isCurrent || isComplete
                          ? 'text-foreground'
                          : 'text-foreground-subtle',
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="hidden text-[11px] text-foreground-subtle md:block">
                        {step.description}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </nav>
  )
}
