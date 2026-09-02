'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { getProductForPathname } from '@/lib/product-catalog'

import { AIAssistant } from './AIAssistant'
import { AnalyticsFirmGate } from './AnalyticsFirmGate'

export function AnalyticsSuiteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const product = getProductForPathname(pathname)

  if (product?.id === 'chrona') {
    return <>{children}</>
  }

  return (
    <AnalyticsFirmGate>
      {children}
      <AIAssistant />
    </AnalyticsFirmGate>
  )
}
