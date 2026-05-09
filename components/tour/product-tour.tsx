'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'cpaautomation.product-tour.v1'

type TourStepId =
  | 'dashboard-intro'
  | 'jobs-new-job'
  | 'create-job-modal'
  | 'upload-files'
  | 'configure-fields'
  | 'review-start'
  | 'processing-status'
  | 'results-form-fill'
  | 'form-fill-source'
  | 'form-fill-target'
  | 'form-fill-run'

interface TourStep {
  id: TourStepId
  title: string
  body: string
  target?: string
  nextLabel?: string
  manual?: boolean
}

interface StoredTourState {
  active: boolean
  stepId: TourStepId
}

interface ProductTourContextValue {
  startTour: () => void
  endTour: () => void
  active: boolean
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard-intro',
    title: 'Start with an extraction job',
    body: 'This tour follows the complete CPAAutomation workflow: create an extraction job, run it, review results, then send a result into Form Fill.',
    target: '[data-tour="dashboard-tour-button"]',
    nextLabel: 'Go to jobs',
  },
  {
    id: 'jobs-new-job',
    title: 'Create a job',
    body: 'Jobs hold the documents, extraction fields, processing run, and results. Click New job to open the job setup dialog.',
    target: '[data-tour="jobs-new-job-button"]',
    nextLabel: 'Open dialog',
  },
  {
    id: 'create-job-modal',
    title: 'Name the extraction',
    body: 'Enter a recognizable job name, then click Start Job. The tour will continue automatically on the upload step after the job is created.',
    target: '[data-tour="job-name-input"]',
    manual: true,
  },
  {
    id: 'upload-files',
    title: 'Upload source documents',
    body: 'Upload PDFs, DOCX, PPTX, XLSX, or ZIP files. When the files are ready, click Continue to move to field configuration.',
    target: '[data-tour="upload-files"]',
    manual: true,
  },
  {
    id: 'configure-fields',
    title: 'Tell the AI what to extract',
    body: 'For each field, provide a field name, data type, and optional prompt. Example: total_amount, Currency, “Extract the total amount due.” Save and continue when ready.',
    target: '[data-tour="field-configuration"]',
    manual: true,
  },
  {
    id: 'review-start',
    title: 'Review and start processing',
    body: 'Confirm the files, fields, and processing mode. Click Start Processing to send the job to the extraction pipeline.',
    target: '[data-tour="start-processing-button"]',
    manual: true,
  },
  {
    id: 'processing-status',
    title: 'Watch extraction progress',
    body: 'This page streams task progress while Gemini extracts your configured fields. You can leave the page; CPAAutomation keeps processing in the background.',
    target: '[data-tour="processing-status"]',
    manual: true,
  },
  {
    id: 'results-form-fill',
    title: 'Use extracted data',
    body: 'Review and edit results, export CSV or Excel, or click Use in Form Fill on a selected result to fill a PDF or DOCX target with extracted values.',
    target: '[data-tour="use-in-form-fill-button"]',
    manual: true,
  },
  {
    id: 'form-fill-source',
    title: 'Confirm the Form Fill source',
    body: 'The selected extraction result is loaded as the source data. Review the preview before choosing the document you want to fill.',
    target: '[data-tour="form-fill-source"]',
    nextLabel: 'Show target',
  },
  {
    id: 'form-fill-target',
    title: 'Choose the target document',
    body: 'Upload a PDF or DOCX target, or choose a saved Form Fill template. You can save uploaded targets as reusable templates.',
    target: '[data-tour="form-fill-target"]',
    nextLabel: 'Show run options',
  },
  {
    id: 'form-fill-run',
    title: 'Run Form Fill',
    body: 'Choose the output format and fill mode, then run Form Fill. CPAAutomation will prepare the filled document in the background.',
    target: '[data-tour="form-fill-run"]',
    nextLabel: 'Finish tour',
  },
]

const ProductTourContext = React.createContext<ProductTourContextValue | null>(null)

function getStepIndex(stepId: TourStepId) {
  return TOUR_STEPS.findIndex((step) => step.id === stepId)
}

function getStepByRoute(pathname: string): TourStepId | null {
  if (pathname === '/dashboard/form-fill') return 'form-fill-source'
  if (/^\/dashboard\/jobs\/[^/]+\/results$/.test(pathname)) return 'results-form-fill'
  if (/^\/dashboard\/jobs\/[^/]+\/processing$/.test(pathname)) return 'processing-status'
  if (/^\/dashboard\/jobs\/[^/]+\/review$/.test(pathname)) return 'review-start'
  if (/^\/dashboard\/jobs\/[^/]+\/fields$/.test(pathname)) return 'configure-fields'
  if (/^\/dashboard\/jobs\/[^/]+\/upload$/.test(pathname)) return 'upload-files'
  if (pathname === '/dashboard/jobs') return 'jobs-new-job'
  if (pathname === '/dashboard') return 'dashboard-intro'
  return null
}

function readStoredState(): StoredTourState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredTourState
    if (!parsed?.active || getStepIndex(parsed.stepId) === -1) return null
    return parsed
  } catch {
    return null
  }
}

function writeStoredState(state: StoredTourState | null) {
  try {
    if (!state) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be unavailable; the in-memory tour still works.
  }
}

function clickTarget(selector: string) {
  const target = document.querySelector<HTMLElement>(selector)
  target?.click()
}

function useTargetRect(selector?: string, stepId?: TourStepId) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const [found, setFound] = React.useState(false)

  React.useEffect(() => {
    if (!selector) {
      setRect(null)
      setFound(false)
      return
    }

    let frame = 0

    const update = () => {
      const target = document.querySelector<HTMLElement>(selector)
      setFound(Boolean(target))
      setRect(target ? target.getBoundingClientRect() : null)
    }

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }

    const scrollToTarget = window.setTimeout(() => {
      document.querySelector<HTMLElement>(selector)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
      scheduleUpdate()
    }, 100)

    update()
    const interval = window.setInterval(update, 300)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)

    return () => {
      window.clearTimeout(scrollToTarget)
      window.clearInterval(interval)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
  }, [selector, stepId])

  return { rect, found }
}

function ProductTourOverlay({
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onEnd,
}: {
  step: TourStep
  stepIndex: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onEnd: () => void
}) {
  const { rect, found } = useTargetRect(step.target, step.id)
  const panelPosition = React.useMemo(() => {
    const width = Math.min(360, Math.max(300, typeof window === 'undefined' ? 340 : window.innerWidth - 32))
    if (!rect) {
      return {
        left: `calc(50vw - ${width / 2}px)`,
        top: 'calc(50vh - 150px)',
        width,
      }
    }

    const margin = 16
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const rightSpace = viewportWidth - rect.right
    const leftSpace = rect.left
    let left = rect.right + margin
    let top = rect.top

    if (rightSpace < width + margin && leftSpace > width + margin) {
      left = rect.left - width - margin
    } else if (rightSpace < width + margin) {
      left = Math.min(Math.max(margin, rect.left), viewportWidth - width - margin)
      top = rect.bottom + margin
    }

    if (top + 260 > viewportHeight) {
      top = Math.max(margin, viewportHeight - 280)
    }

    return {
      left: `${Math.max(margin, Math.min(left, viewportWidth - width - margin))}px`,
      top: `${Math.max(margin, top)}px`,
      width,
    }
  }, [rect])

  return createPortal(
    <div className="fixed inset-0 z-[80] pointer-events-none" aria-live="polite">
      <div className="absolute inset-0 bg-slate-950/20" />

      {rect && (
        <div
          className="absolute rounded-xl border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.25)] transition-all"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      <section
        role="dialog"
        aria-modal="false"
        aria-label="Product tour"
        className="absolute pointer-events-auto rounded-xl border border-border bg-background p-4 shadow-xl"
        style={panelPosition}
      >
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
            <Button variant="outline" size="sm" onClick={onBack} disabled={stepIndex === 0}>Back</Button>
            {!step.manual && (
              <Button size="sm" onClick={onNext}>
                {step.nextLabel || (stepIndex === totalSteps - 1 ? 'Finish tour' : 'Next')}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const [mounted, setMounted] = React.useState(false)
  const [active, setActive] = React.useState(false)
  const [stepId, setStepId] = React.useState<TourStepId>('dashboard-intro')

  const stepIndex = Math.max(0, getStepIndex(stepId))
  const step = TOUR_STEPS[stepIndex]

  const setStep = React.useCallback((nextStepId: TourStepId) => {
    setStepId(nextStepId)
    writeStoredState({ active: true, stepId: nextStepId })
  }, [])

  const endTour = React.useCallback(() => {
    setActive(false)
    setStepId('dashboard-intro')
    writeStoredState(null)
  }, [])

  const startTour = React.useCallback(() => {
    setActive(true)
    setStep('dashboard-intro')
    if (pathname !== '/dashboard') router.push('/dashboard')
  }, [pathname, router, setStep])

  React.useEffect(() => {
    setMounted(true)
    const stored = readStoredState()
    if (stored) {
      setActive(true)
      setStepId(stored.stepId)
    }
  }, [])

  React.useEffect(() => {
    if (!active) return
    writeStoredState({ active: true, stepId })
  }, [active, stepId])

  React.useEffect(() => {
    if (!active) return

    const routeStepId = getStepByRoute(pathname)
    if (!routeStepId) return

    const routeIndex = getStepIndex(routeStepId)
    if (routeIndex > stepIndex) {
      setStep(routeStepId)
    }
  }, [active, pathname, setStep, stepIndex])

  React.useEffect(() => {
    if (!active || pathname !== '/dashboard/jobs') return

    const interval = window.setInterval(() => {
      if (document.querySelector('[data-tour="job-name-input"]') && stepId === 'jobs-new-job') {
        setStep('create-job-modal')
      }
    }, 200)

    return () => window.clearInterval(interval)
  }, [active, pathname, setStep, stepId])

  React.useEffect(() => {
    if (!active) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endTour()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, endTour])

  const goBack = React.useCallback(() => {
    if (stepIndex <= 0) return
    setStep(TOUR_STEPS[stepIndex - 1].id)
  }, [setStep, stepIndex])

  const goNext = React.useCallback(() => {
    if (step.id === 'dashboard-intro') {
      setStep('jobs-new-job')
      router.push('/dashboard/jobs')
      return
    }

    if (step.id === 'jobs-new-job') {
      clickTarget('[data-tour="jobs-new-job-button"]')
      setStep('create-job-modal')
      return
    }

    if (step.id === 'form-fill-run') {
      endTour()
      return
    }

    const nextStep = TOUR_STEPS[stepIndex + 1]
    if (nextStep) setStep(nextStep.id)
  }, [endTour, router, setStep, step.id, stepIndex])

  const contextValue = React.useMemo<ProductTourContextValue>(
    () => ({ startTour, endTour, active }),
    [active, endTour, startTour],
  )

  return (
    <ProductTourContext.Provider value={contextValue}>
      {children}
      {mounted && active && step && (
        <ProductTourOverlay
          step={step}
          stepIndex={stepIndex}
          totalSteps={TOUR_STEPS.length}
          onBack={goBack}
          onNext={goNext}
          onEnd={endTour}
        />
      )}
    </ProductTourContext.Provider>
  )
}

export function useProductTour() {
  const context = React.useContext(ProductTourContext)
  if (!context) {
    return {
      active: false,
      startTour: () => {},
      endTour: () => {},
    }
  }
  return context
}
