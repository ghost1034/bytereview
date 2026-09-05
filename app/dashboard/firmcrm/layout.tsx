import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FirmCrmProvider } from '@/components/firmcrm/FirmCrmProvider'

export const metadata: Metadata = { title: 'FirmCRM', description: 'Relationships, pursuits, clearance, and firm growth.' }
export default function FirmCrmLayout({ children }: { children: ReactNode }) {
  return <div className="firmcrm-root"><FirmCrmProvider>{children}</FirmCrmProvider></div>
}
