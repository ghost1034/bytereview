import type { ReactNode } from 'react'

import { TaxAtlasPaidAccessGate } from '@/taxatlas-ui/TaxAtlasPaidAccessGate'
import '@/taxatlas-ui/taxatlas.css'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function TaxAtlasLayout({ children }: { children: ReactNode }) {
  return <TaxAtlasPaidAccessGate>{children}</TaxAtlasPaidAccessGate>
}

