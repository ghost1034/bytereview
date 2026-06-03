'use client'

import * as React from 'react'
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCurrentUser, useMarkWelcomeTourSeen } from '@/hooks/useUserProfile'
import {
  hasStoredTourState,
  useProductTour,
  type TourId,
} from '@/components/tour/product-tour'

const TOURS: Array<{ id: TourId; title: string; description: string }> = [
  {
    id: 'extraction',
    title: 'Extraction Jobs',
    description:
      'Create a job, upload documents, extract fields, and review results.',
  },
  {
    id: 'form-fill',
    title: 'Form Fill',
    description: 'Fill a PDF or DOCX target from uploaded or extracted data.',
  },
  {
    id: 'inkwise',
    title: 'Inkwise',
    description: 'Grounded AI writing with references, chat, and review.',
  },
]

export function WelcomeTourDialog() {
  const { user, isLoading } = useCurrentUser()
  const { startTour, active } = useProductTour()
  const markSeen = useMarkWelcomeTourSeen()
  const [open, setOpen] = React.useState(false)
  const decidedRef = React.useRef(false)

  React.useEffect(() => {
    // Decide once, only after the profile has settled and no tour is running.
    // `hasStoredTourState` covers the gap before the provider's mount effect
    // restores an in-progress tour from localStorage and flips `active`.
    if (decidedRef.current || isLoading || !user || active) return
    if (hasStoredTourState()) return
    decidedRef.current = true
    if (user.welcome_tour_seen_at == null) setOpen(true)
  }, [active, isLoading, user])

  const dismiss = React.useCallback(() => {
    setOpen(false)
    markSeen.mutate()
  }, [markSeen])

  const chooseTour = React.useCallback(
    (tourId: TourId) => {
      setOpen(false)
      markSeen.mutate()
      startTour(tourId)
    },
    [markSeen, startTour],
  )

  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />
            Welcome to CPAAutomation!
          </DialogTitle>
          <DialogDescription>
            Take a quick guided tour to get started. You can revisit any tour
            later from the dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {TOURS.map((tour) => (
            <button
              key={tour.id}
              type="button"
              onClick={() => chooseTour(tour.id)}
              className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-medium">{tour.title}</span>
              <span className="block text-xs text-foreground-muted">
                {tour.description}
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
