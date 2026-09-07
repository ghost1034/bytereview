'use client'

import type { ReactNode } from 'react'
import { Building2 } from 'lucide-react'

import { PaidProductAccessGate } from '@/components/paid-product-access-gate'

export function isFirmCrmProPlan(planCode: string | null | undefined) {
  return planCode?.trim().toLowerCase() === 'pro'
}

export function FirmCrmProAccessGate({ children }: { children: ReactNode }) {
  return (
    <PaidProductAccessGate
      productName="FirmCRM"
      icon={Building2}
      description="FirmCRM is available on the Pro plan. Upgrade to manage client relationships, pursuits, clearance, and firm growth."
      isPlanAllowed={isFirmCrmProPlan}
      planCodes={['pro']}
      viewPlansLabel="View Pro plan"
    >
      {children}
    </PaidProductAccessGate>
  )
}
