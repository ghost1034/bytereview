'use client'

import { type ReactNode } from 'react'
import { FolderKanban } from 'lucide-react'

import {
  isPaidProductPlan,
  PaidProductAccessGate,
} from '@/components/paid-product-access-gate'

export function isPaidTasklyticPlan(planCode: string | null | undefined) {
  return isPaidProductPlan(planCode)
}

export function TasklyticPaidAccessGate({ children }: { children: ReactNode }) {
  return (
    <PaidProductAccessGate
      productName="Tasklytic"
      icon={FolderKanban}
      description="Tasklytic is available with any paid CPAAutomation plan. Upgrade to plan client work, manage teams, track time, and report on delivery."
    >
      {children}
    </PaidProductAccessGate>
  )
}
