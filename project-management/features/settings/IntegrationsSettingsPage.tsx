'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { tasklyticApiJson } from '../../lib/tasklyticApi'

type Capability = {
  provider: 'google_drive' | 'vertex_receipts' | 'gmail' | 'gcs' | 'stripe_connect'
  status: 'active' | 'degraded' | 'revoked' | 'disabled'
  available: boolean
  lastError?: { code: string; detail?: string } | null
}

const LABELS: Record<Capability['provider'], string> = {
  google_drive: 'Google Drive import', vertex_receipts: 'Vertex receipt extraction',
  gmail: 'Gmail delivery', gcs: 'Private GCS storage', stripe_connect: 'Stripe Connect client payments',
}

export function IntegrationsSettingsPage() {
  const { workspaceId } = useWorkspaceContext()
  const [items, setItems] = useState<Capability[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!workspaceId) return
    void tasklyticApiJson<{ capabilities: Capability[] }>(`/integrations/capabilities?workspace_id=${encodeURIComponent(workspaceId)}`)
      .then((result) => setItems(result.capabilities))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Integration status is unavailable.'))
  }, [workspaceId])
  return <div className="space-y-4">
    <div><h1 className="font-sans text-2xl">Production integrations</h1><p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Only providers supported by Tasklytic are listed. Workspace-plan billing remains under Workspace Billing and is not a client-payment integration.</p></div>
    {error ? <p className="rounded-lg border border-border bg-card text-card-foreground p-4 text-sm" role="alert">{error}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => <section className="rounded-lg border border-border bg-card text-card-foreground p-4" key={item.provider}>
        <div className="flex items-center justify-between gap-3"><h2 className="font-medium">{LABELS[item.provider]}</h2><Badge variant="outline">{item.available ? 'Available' : item.status === 'revoked' ? 'Reconnect required' : 'Not enabled'}</Badge></div>
        {item.lastError ? <p className="mt-2 text-sm" role="status">{item.lastError.code.replace(/_/g, ' ')}</p> : null}
        {item.provider === 'google_drive' && !item.available ? <Link className="mt-3 inline-block text-sm underline" href="/dashboard/integrations">Manage Google connection</Link> : null}
      </section>)}
      {!error && items.length === 0 ? <p className="text-sm" role="status">Loading integration capabilities…</p> : null}
    </div>
  </div>
}
