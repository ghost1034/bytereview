'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, type ComponentType } from 'react'

import { AppShell } from '@/taxatlas-ui/components/layout/AppShell'
import { ToastProvider } from '@/taxatlas-ui/components/ui/Toast'
import { initTheme } from '@/taxatlas-ui/hooks/useTheme'
import AccountPage from '@/taxatlas-ui/pages/AccountPage'
import ChangesPage from '@/taxatlas-ui/pages/ChangesPage'
import CourtDecisionsPage from '@/taxatlas-ui/pages/CourtDecisionsPage'
import JurisdictionPage from '@/taxatlas-ui/pages/JurisdictionPage'
import JurisdictionsPage from '@/taxatlas-ui/pages/JurisdictionsPage'
import NotFoundPage from '@/taxatlas-ui/pages/NotFoundPage'
import OverviewPage from '@/taxatlas-ui/pages/OverviewPage'
import RegulationsPage from '@/taxatlas-ui/pages/RegulationsPage'
import SourcesPage from '@/taxatlas-ui/pages/SourcesPage'
import TariffsPage from '@/taxatlas-ui/pages/TariffsPage'

const MapPage = dynamic(() => import('@/taxatlas-ui/pages/MapPage'), {
  ssr: false,
  loading: () => <div className="page-spinner">Loading map…</div>,
})

const ROUTES: Record<string, ComponentType> = {
  map: MapPage,
  overview: OverviewPage,
  jurisdictions: JurisdictionsPage,
  regulations: RegulationsPage,
  'court-decisions': CourtDecisionsPage,
  tariffs: TariffsPage,
  changes: ChangesPage,
  sources: SourcesPage,
  account: AccountPage,
}

export function TaxAtlasModule() {
  const pathname = usePathname() ?? '/dashboard/taxatlas/map'
  const relative = pathname.replace(/^\/dashboard\/taxatlas\/?/, '') || 'map'
  const segments = relative.split('/').filter(Boolean)
  let Page = ROUTES[segments[0]] ?? NotFoundPage
  if (segments[0] === 'jurisdictions' && segments[1]) Page = JurisdictionPage

  useEffect(() => initTheme(), [])

  return (
    <div className="taxatlas-root h-full min-h-[640px] min-w-0 overflow-hidden" data-theme="dark">
      <ToastProvider>
        <AppShell>
          <Page />
        </AppShell>
      </ToastProvider>
    </div>
  )
}

