'use client'

import { Globe2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { PaidProductAccessGate } from '@/components/paid-product-access-gate'

export function TaxAtlasPaidAccessGate({ children }: { children: ReactNode }) {
  return (
    <PaidProductAccessGate
      productName="TaxAtlas"
      icon={Globe2}
      description="TaxAtlas is available with any paid CPAAutomation plan. Upgrade to monitor global tax rates, regulations, court decisions, tariffs, and source changes."
    >
      {children}
    </PaidProductAccessGate>
  )
}

