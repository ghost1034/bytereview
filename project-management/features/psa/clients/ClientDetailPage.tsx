'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { useClientsStore, useExpensesStore, useInvoicesStore, useMattersStore, useProjectsStore, useTimeEntriesStore } from '../../../stores/entities'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { wipTotal } from '../../../lib/billing/selectors'
import { matterTerminology } from '../../../lib/psa/terminology'
import { ClientDialog } from './ClientDialog'

export function ClientDetailPage({ clientId }: { clientId: string }) {
  const [editOpen, setEditOpen] = useState(false)
  const { workspaceId, workspace } = useWorkspaceContext()
  const client = useClientsStore((s) => s.getById(clientId))
  const matters = useMattersStore((s) => s.list().filter((m) => m.clientId === clientId))
  const projects = useProjectsStore((s) => s.list())
  const time = useTimeEntriesStore((s) => s.list().filter((e) => e.clientId === clientId))
  const expenses = useExpensesStore((s) => s.list().filter((e) => e.clientId === clientId))
  const invoices = useInvoicesStore((s) => s.list().filter((e) => e.clientId === clientId))
  const terms = matterTerminology(workspace)
  usePageMeta({ breadcrumbs: [{ label: 'Clients' }, { label: client?.name ?? 'Client' }] })
  if (!workspaceId || !client || client.workspaceId !== workspaceId) return <p>Client not found.</p>
  const ar = invoices.reduce((sum, invoice) => sum + (invoice.amountOutstanding ?? 0), 0)
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3"><div><h1 className="font-sans text-2xl">{client.name}</h1><p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{client.contactName ?? 'No primary contact'} · {client.contactEmail ?? 'No email'}</p></div><Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit client</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="WIP" value={formatMoney(wipTotal(time, expenses))} /><Metric label="Accounts receivable" value={formatMoney(ar)} /><Metric label="Retainer" value={formatMoney(client.retainerBalance ?? 0)} /></div>
    <div className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm"><h2 className="mb-3 font-medium">{terms.plural}</h2><div className="space-y-2">{matters.map((matter) => <Link className="flex justify-between rounded-md border p-3 hover:underline" key={matter.id} href={`/dashboard/project-management/w/${workspaceId}/psa/${terms.route}/${matter.id}`}><span>{projects.find((p) => p.id === matter.projectId)?.name ?? matter.matterNumber}</span><span>{matter.status}</span></Link>)}</div></div>
    {editOpen && <ClientDialog open onOpenChange={setEditOpen} workspaceId={workspaceId} client={client} />}
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm"><p className="text-xs uppercase" style={{ color: 'hsl(var(--foreground-muted))' }}>{label}</p><p className="font-mono text-xl">{value}</p></div> }
