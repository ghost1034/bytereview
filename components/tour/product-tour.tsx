'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'cpaautomation.product-tour.v2'
const LEGACY_STORAGE_KEY = 'cpaautomation.product-tour.v1'

export type TourId = 'extraction' | 'form-fill' | 'inkwise'

type TourNextAction =
  | { kind: 'navigate'; href: string }
  | { kind: 'click'; selector: string }
  | { kind: 'end' }

interface TourStep {
  id: string
  title: string
  body: string
  target?: string
  nextLabel?: string
  manual?: boolean
  /** What clicking Next does, in addition to advancing to the next step. */
  onNext?: TourNextAction
  /** Selector polled while on this step; when it appears, the tour advances. */
  advanceWhen?: string
}

interface TourDefinition {
  id: TourId
  steps: TourStep[]
  getStepByRoute: (pathname: string) => string | null
}

interface StoredTourState {
  tourId: TourId
  active: boolean
  stepId: string
}

interface ProductTourContextValue {
  startTour: (tourId?: TourId) => void
  endTour: () => void
  active: boolean
}

const EXTRACTION_STEPS: TourStep[] = [
  {
    id: 'dashboard-intro',
    title: 'Start with an extraction job',
    body: 'This tour walks through extraction jobs: create a job, upload documents, configure fields, run it, and review results. Sending results to Form Fill has its own tour.',
    target: '[data-tour="dashboard-tour-button"]',
    nextLabel: 'Go to jobs',
    onNext: { kind: 'navigate', href: '/dashboard/jobs' },
  },
  {
    id: 'jobs-new-job',
    title: 'Create a job',
    body: 'Jobs hold the documents, extraction fields, processing run, and results. Click New job to open the job setup dialog.',
    target: '[data-tour="jobs-new-job-button"]',
    nextLabel: 'Open dialog',
    onNext: { kind: 'click', selector: '[data-tour="jobs-new-job-button"]' },
    advanceWhen: '[data-tour="job-name-input"]',
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
    body: 'This page streams task progress while AI extracts your configured fields. You can leave the page; CPAAutomation keeps processing in the background.',
    target: '[data-tour="processing-status"]',
    manual: true,
  },
  {
    id: 'results-overview',
    title: 'Review your results',
    body: 'Review and edit extracted values, then export to CSV or Excel. To fill a PDF or DOCX with these values, select a result and use Use in Form Fill — that flow is covered by the separate Form Fill tour.',
    target: '[data-tour="use-in-form-fill-button"]',
    nextLabel: 'Finish tour',
    onNext: { kind: 'end' },
  },
]

function getExtractionStepByRoute(pathname: string): string | null {
  if (/^\/dashboard\/jobs\/[^/]+\/results$/.test(pathname)) return 'results-overview'
  if (/^\/dashboard\/jobs\/[^/]+\/processing$/.test(pathname)) return 'processing-status'
  if (/^\/dashboard\/jobs\/[^/]+\/review$/.test(pathname)) return 'review-start'
  if (/^\/dashboard\/jobs\/[^/]+\/fields$/.test(pathname)) return 'configure-fields'
  if (/^\/dashboard\/jobs\/[^/]+\/upload$/.test(pathname)) return 'upload-files'
  if (pathname === '/dashboard/jobs') return 'jobs-new-job'
  if (pathname === '/dashboard') return 'dashboard-intro'
  return null
}

const FORM_FILL_STEPS: TourStep[] = [
  {
    id: 'form-fill-intro',
    title: 'Fill documents with Form Fill',
    body: 'Form Fill takes source data and writes it into a PDF or DOCX target. You can upload source files directly, or send results in from an extraction job.',
    target: '[data-tour="dashboard-tour-button"]',
    nextLabel: 'Open Form Fill',
    onNext: { kind: 'navigate', href: '/dashboard/form-fill' },
  },
  {
    id: 'form-fill-source',
    title: 'Choose your source data',
    body: 'Upload source files (CSV, XLSX, PDF, or DOCX) to pull values from. If you arrived here from a job’s results, the extraction data is preloaded as the source instead.',
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
    onNext: { kind: 'end' },
  },
]

function getFormFillStepByRoute(pathname: string): string | null {
  if (pathname === '/dashboard/form-fill') return 'form-fill-source'
  if (pathname === '/dashboard') return 'form-fill-intro'
  return null
}

const INKWISE_STEPS: TourStep[] = [
  {
    id: 'inkwise-intro',
    title: 'Meet Inkwise',
    body: 'Inkwise is grounded AI writing. This tour walks through references, the writing canvas, the AI sidebar, and templates.',
    target: '[data-tour="dashboard-tour-button"]',
    nextLabel: 'Open Inkwise',
    onNext: { kind: 'navigate', href: '/dashboard/inkwise/write' },
  },
  {
    id: 'inkwise-module-nav',
    title: 'Move around Inkwise',
    body: 'Use these sections any time: Write for documents, References for your source library, Templates for reusable starters, and Help.',
    target: '[data-tour="inkwise-module-nav"]',
    nextLabel: 'See References',
    onNext: { kind: 'navigate', href: '/dashboard/inkwise/references' },
  },
  {
    id: 'inkwise-import-panel',
    title: 'Add references',
    body: 'Upload PDFs, DOCX, images, webpages, or Drive files here. Inkwise ingests each one into retrieval segments so it can ground your writing. You don’t need to upload anything now.',
    target: '[data-tour="inkwise-import-panel"]',
  },
  {
    id: 'inkwise-source-library',
    title: 'Your source library',
    body: 'Ingested references live here. Search them, edit citation metadata, or re-ingest. Ready sources can be bound to any document.',
    target: '[data-tour="inkwise-source-library"]',
    nextLabel: 'Back to Write',
    onNext: { kind: 'navigate', href: '/dashboard/inkwise/write' },
  },
  {
    id: 'inkwise-write-overview',
    title: 'Organize your documents',
    body: 'Folders keep drafts tidy on the left, and your documents show on the right. Let’s create one.',
    target: '[data-tour="inkwise-document-grid"]',
  },
  {
    id: 'inkwise-new-document',
    title: 'Create a document',
    body: 'Click New document, give it a title, and create it. The tour continues automatically once your document opens.',
    target: '[data-tour="inkwise-new-document-button"]',
    manual: true,
  },
  {
    id: 'inkwise-editor-title',
    title: 'Title and write',
    body: 'Name your document here, then write in the canvas below. Inkwise offers inline predictions as you type.',
    target: '[data-tour="inkwise-editor-title"]',
  },
  {
    id: 'inkwise-editor-canvas',
    title: 'The writing canvas',
    body: 'This is your editor. Select text to get inline writing tools — rewrite, condense, expand, or humanize.',
    target: '[data-tour="inkwise-editor-canvas"]',
    nextLabel: 'Show AI Chat',
    onNext: { kind: 'click', selector: '[data-tour="inkwise-sidebar-tab-chat"]' },
  },
  {
    id: 'inkwise-sidebar-chat',
    title: 'Chat with your sources',
    body: 'The AI Chat tab answers from your bound references and can insert responses straight into the draft.',
    target: '[data-tour="inkwise-sidebar-tab-chat"]',
    nextLabel: 'Show References',
    onNext: { kind: 'click', selector: '[data-tour="inkwise-sidebar-tab-references"]' },
  },
  {
    id: 'inkwise-sidebar-references',
    title: 'Bind references',
    body: 'The References tab binds library sources to this document so chat and predictions can cite them.',
    target: '[data-tour="inkwise-sidebar-tab-references"]',
    nextLabel: 'Show Review',
    onNext: { kind: 'click', selector: '[data-tour="inkwise-sidebar-tab-review"]' },
  },
  {
    id: 'inkwise-sidebar-review',
    title: 'Review changes',
    body: 'The Review tab collects tracked changes and comments so you can accept, reject, or resolve them.',
    target: '[data-tour="inkwise-sidebar-tab-review"]',
    nextLabel: 'See Templates',
    onNext: { kind: 'navigate', href: '/dashboard/inkwise/templates' },
  },
  {
    id: 'inkwise-templates',
    title: 'Reusable templates',
    body: 'Save recurring document structures as templates, import DOCX, or browse system categories.',
    target: '[data-tour="inkwise-templates"]',
    nextLabel: 'Finish on Help',
    onNext: { kind: 'navigate', href: '/dashboard/inkwise/help' },
  },
  {
    id: 'inkwise-help',
    title: 'You’re set',
    body: 'Find guides, shortcuts, and answers any time on the Help page. That’s the Inkwise tour — happy writing!',
    target: '[data-tour="inkwise-nav-help"]',
    nextLabel: 'Finish tour',
    onNext: { kind: 'end' },
  },
]

function getInkwiseStepByRoute(pathname: string): string | null {
  if (/^\/dashboard\/inkwise\/write\/[^/]+$/.test(pathname)) return 'inkwise-editor-title'
  if (pathname === '/dashboard/inkwise/write') return 'inkwise-module-nav'
  if (pathname === '/dashboard/inkwise/references') return 'inkwise-import-panel'
  if (pathname === '/dashboard/inkwise/templates') return 'inkwise-templates'
  if (pathname === '/dashboard/inkwise/help') return 'inkwise-help'
  if (pathname === '/dashboard') return 'inkwise-intro'
  return null
}

const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  extraction: { id: 'extraction', steps: EXTRACTION_STEPS, getStepByRoute: getExtractionStepByRoute },
  'form-fill': { id: 'form-fill', steps: FORM_FILL_STEPS, getStepByRoute: getFormFillStepByRoute },
  inkwise: { id: 'inkwise', steps: INKWISE_STEPS, getStepByRoute: getInkwiseStepByRoute },
}

const ProductTourContext = React.createContext<ProductTourContextValue | null>(null)

function getStepIndex(definition: TourDefinition, stepId: string) {
  return definition.steps.findIndex((step) => step.id === stepId)
}

function readStoredState(): StoredTourState | null {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredTourState
    const definition = parsed?.tourId ? TOUR_DEFINITIONS[parsed.tourId] : undefined
    if (!parsed?.active || !definition || getStepIndex(definition, parsed.stepId) === -1) return null
    return parsed
  } catch {
    return null
  }
}

/** Whether a tour is in progress per localStorage (e.g. mid-tour page reload). */
export function hasStoredTourState() {
  return readStoredState() !== null
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

function useTargetRect(selector?: string, stepId?: string) {
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
  const [tourId, setTourId] = React.useState<TourId>('extraction')
  const [stepId, setStepId] = React.useState<string>(EXTRACTION_STEPS[0].id)

  const definition = TOUR_DEFINITIONS[tourId]
  const stepIndex = Math.max(0, getStepIndex(definition, stepId))
  const step = definition.steps[stepIndex]

  const setStep = React.useCallback((nextTourId: TourId, nextStepId: string) => {
    setStepId(nextStepId)
    writeStoredState({ tourId: nextTourId, active: true, stepId: nextStepId })
  }, [])

  const endTour = React.useCallback(() => {
    setActive(false)
    setStepId(TOUR_DEFINITIONS[tourId].steps[0].id)
    writeStoredState(null)
  }, [tourId])

  const startTour = React.useCallback(
    (nextTourId: TourId = 'extraction') => {
      setTourId(nextTourId)
      setActive(true)
      setStep(nextTourId, TOUR_DEFINITIONS[nextTourId].steps[0].id)
      if (pathname !== '/dashboard') router.push('/dashboard')
    },
    [pathname, router, setStep],
  )

  React.useEffect(() => {
    setMounted(true)
    const stored = readStoredState()
    if (stored) {
      setTourId(stored.tourId)
      setActive(true)
      setStepId(stored.stepId)
    }
  }, [])

  React.useEffect(() => {
    if (!active) return
    writeStoredState({ tourId, active: true, stepId })
  }, [active, stepId, tourId])

  React.useEffect(() => {
    if (!active) return

    const routeStepId = definition.getStepByRoute(pathname)
    if (!routeStepId) return

    const routeIndex = getStepIndex(definition, routeStepId)
    if (routeIndex > stepIndex) {
      setStep(tourId, routeStepId)
    }
  }, [active, definition, pathname, setStep, stepIndex, tourId])

  React.useEffect(() => {
    if (!active || !step?.advanceWhen) return

    const selector = step.advanceWhen
    const interval = window.setInterval(() => {
      if (document.querySelector(selector)) {
        const nextStep = definition.steps[stepIndex + 1]
        if (nextStep) setStep(tourId, nextStep.id)
      }
    }, 200)

    return () => window.clearInterval(interval)
  }, [active, definition, setStep, step, stepIndex, tourId])

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
    setStep(tourId, definition.steps[stepIndex - 1].id)
  }, [definition, setStep, stepIndex, tourId])

  const goNext = React.useCallback(() => {
    const action = step?.onNext
    if (action?.kind === 'end') {
      endTour()
      return
    }

    if (action?.kind === 'click') {
      clickTarget(action.selector)
    }

    const nextStep = definition.steps[stepIndex + 1]
    if (!nextStep) {
      endTour()
      return
    }
    setStep(tourId, nextStep.id)

    if (action?.kind === 'navigate') {
      router.push(action.href)
    }
  }, [definition, endTour, router, setStep, step, stepIndex, tourId])

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
          totalSteps={definition.steps.length}
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
    const fallback: ProductTourContextValue = {
      active: false,
      startTour: () => {},
      endTour: () => {},
    }
    return fallback
  }
  return context
}
