import type { ReactNode } from 'react'

import { DevelopmentDisclaimer } from '@/components/esign/development-disclaimer'
import { EsignWorkspaceNav } from '@/components/esign/EsignWorkspaceNav'

export default function EsignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DevelopmentDisclaimer />
      <EsignWorkspaceNav />
      {children}
    </>
  )
}
