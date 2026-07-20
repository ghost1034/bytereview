import type { ReactNode } from 'react'

import { DevelopmentDisclaimer } from '@/components/esign/development-disclaimer'
import { EsignWorkspaceNav } from '@/components/esign/EsignWorkspaceNav'
import { EsignRouteGuard } from '@/components/esign/EsignRouteGuard'

export default function EsignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DevelopmentDisclaimer />
      <EsignWorkspaceNav />
      <EsignRouteGuard>{children}</EsignRouteGuard>
    </>
  )
}
