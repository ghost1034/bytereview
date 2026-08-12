'use client'

type TourStarter = () => void
let externalStart: TourStarter | null = null

export function registerProductTourStarter(starter: TourStarter | null): void {
  externalStart = starter
}

export function startProductTour(): void {
  externalStart?.()
}
