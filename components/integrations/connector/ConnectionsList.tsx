'use client'

import { Loader2, Plug, RefreshCw, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import {
  useConnectorConnections,
  useDeleteConnectorConnection,
  useTestConnectorConnection,
} from '@/hooks/useConnector'
import type { ConnectorConnection } from '@/lib/connector-types'

function statusBadge(connection: ConnectorConnection) {
  switch (connection.status) {
    case 'active':
      return (
        <Badge variant="outline" className="border-success/20 bg-success-soft text-success">
          Active
        </Badge>
      )
    case 'pending':
      return <Badge variant="secondary">Authorizing…</Badge>
    case 'error':
      return <Badge variant="destructive">Needs attention</Badge>
    default:
      return <Badge variant="secondary">{connection.status}</Badge>
  }
}

/** The user's OpenConnector connections with test/disconnect controls. */
export function ConnectionsList() {
  const { data, isLoading } = useConnectorConnections()
  const testConnection = useTestConnectorConnection()
  const deleteConnection = useDeleteConnectorConnection()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-foreground-muted">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        Loading connections…
      </div>
    )
  }

  const connections = data?.connections || []
  if (connections.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No integrations connected yet. Connect one from the catalog below — it becomes
        available across CPAAutomation and your Claw agents immediately.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {connections.map((connection) => (
        <li key={connection.id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile icon={Plug} tone="neutral" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {connection.display_name || connection.service}
                {connection.label && (
                  <span className="ml-1.5 text-xs text-foreground-muted">({connection.label})</span>
                )}
              </p>
              <p className="truncate text-xs text-foreground-muted">
                {connection.auth_type === 'oauth2' ? 'Signed in with OAuth' : 'API credential'}
                {connection.error_message ? ` — ${connection.error_message}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {statusBadge(connection)}
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnection.mutate(connection.id)}
              disabled={testConnection.isPending}
              title="Verify this connection"
            >
              <RefreshCw
                className={`size-3.5 ${testConnection.isPending ? 'animate-spin' : ''}`}
                aria-hidden
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteConnection.mutate(connection.id)}
              disabled={deleteConnection.isPending}
              title="Disconnect"
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
