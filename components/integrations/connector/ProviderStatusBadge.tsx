'use client'

import { CheckCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ConnectorCatalogProvider } from '@/lib/connector-types'

/**
 * Availability badge for one catalog provider:
 *  - Connected: the user has an active connection
 *  - Available: connectable now (api_key/custom always; oauth2 once CPAA
 *    registered an OAuth app for the service)
 *  - OAuth pending: oauth2-only provider without a registered CPAA app yet
 */
export function ProviderStatusBadge({ provider }: { provider: ConnectorCatalogProvider }) {
  if (provider.connected) {
    return (
      <Badge variant="outline" className="border-success/20 bg-success-soft text-success">
        <CheckCircle className="mr-1 size-3" aria-hidden />
        Connected
      </Badge>
    )
  }
  if (provider.available) {
    return <Badge variant="secondary">Available</Badge>
  }
  return (
    <Badge variant="outline" className="text-foreground-muted">
      <Clock className="mr-1 size-3" aria-hidden />
      OAuth pending
    </Badge>
  )
}
