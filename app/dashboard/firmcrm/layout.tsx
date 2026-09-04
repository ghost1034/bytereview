import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import { FirmCrmProvider } from '@/components/firmcrm/FirmCrmProvider'

const geist = Geist({ subsets: ['latin'], variable: '--font-firmcrm-geist' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-firmcrm-mono' })
export const metadata: Metadata = { title: 'FirmCRM', description: 'Relationships, pursuits, clearance, and firm growth.' }
export default function FirmCrmLayout({ children }: { children: ReactNode }) {
  return <div className={`firmcrm-root ${geist.variable} ${mono.variable}`}><FirmCrmProvider>{children}</FirmCrmProvider></div>
}
