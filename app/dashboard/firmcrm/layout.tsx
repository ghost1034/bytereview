import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FirmCrmProvider } from '@/components/firmcrm/FirmCrmProvider'
import { FirmCrmProAccessGate } from '@/components/firmcrm/FirmCrmProAccessGate'

export const metadata: Metadata = { title: 'FirmCRM', description: 'Relationships, pursuits, clearance, and firm growth.' }
export default function FirmCrmLayout({ children }: { children: ReactNode }) {
  return (
    <FirmCrmProAccessGate>
      <div className="firmcrm-root"><FirmCrmProvider>{children}</FirmCrmProvider></div>
    </FirmCrmProAccessGate>
  )
}
