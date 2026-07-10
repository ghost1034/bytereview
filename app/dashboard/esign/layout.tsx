import type { ReactNode } from 'react'

import { DevelopmentDisclaimer } from '@/components/esign/development-disclaimer'

export default function EsignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DevelopmentDisclaimer />
      {children}
    </>
  )
}
