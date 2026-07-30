import type { ReactNode } from 'react'

import { EsignWorkspaceNav } from '@/components/esign/EsignWorkspaceNav'
import { EsignRouteGuard } from '@/components/esign/EsignRouteGuard'

export default function EsignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EsignWorkspaceNav />
      <EsignRouteGuard>{children}</EsignRouteGuard>
    </>
  )
}
