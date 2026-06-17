'use client'

import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useProductTour, type TourId } from '@/components/tour/product-tour'

export function ProductTourButton({
  tourId,
  size,
}: {
  tourId: TourId
  size?: 'sm' | 'default'
}) {
  const { startTour } = useProductTour()
  return (
    <Button type="button" variant="tour" size={size} onClick={() => startTour(tourId)}>
      <Sparkles className="mr-1.5 size-4" aria-hidden />
      Take product tour
    </Button>
  )
}
