'use client'

/** Clients list and CRUD. */
import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useClientsStore, useMattersStore, useInvoicesStore } from '../../stores/entities'
import { wipTotal } from '../../lib/billing/selectors'
import { useTimeEntriesStore, useExpensesStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { ClientDialog } from './clients/ClientDialog'

export function ClientsPage() {
  const { workspaceId } = useWorkspaceContext()
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const matters = useMattersStore((s) => s.list())
  const invoices = useInvoicesStore((s) => s.list())
  const entries = useTimeEntriesStore((s) => s.list())
  const expenses = useExpensesStore((s) => s.list())
  const update = useClientsStore((s) => s.update)
  const [open, setOpen] = useState(false)

  usePageMeta({ breadcrumbs: [{ label: 'Clients' }] })

  if (!workspaceId) return null

  return (
    <div className="space-y-4" data-tour-page="clients">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-2xl">Clients</h1>
        <Button className=" border-0" size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New client</Button>
      </div>
      <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
            <th className="px-4 py-2">Name</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Matters</th>
            <th className="px-4 py-2 text-right">WIP</th><th className="px-4 py-2 text-right">AR</th><th className="px-4 py-2 text-right">Retainer</th><th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {clients.map((c) => {
              const clientMatters = matters.filter((m) => m.clientId === c.id).length
              const clientEntries = entries.filter((e) => e.clientId === c.id)
              const clientExp = expenses.filter((e) => e.clientId === c.id)
              const wip = wipTotal(clientEntries, clientExp)
              const ar = invoices.filter((i) => i.clientId === c.id).reduce((s, i) => s + (i.amountOutstanding ?? 0), 0)
              return (
                <tr key={c.id} className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <td className="px-4 py-2 font-medium"><Link className="hover:underline" href={`/dashboard/project-management/w/${workspaceId}/psa/clients/${c.id}`}>{c.name}</Link></td>
                  <td className="px-4 py-2">{c.type}</td>
                  <td className="px-4 py-2">{clientMatters}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(wip)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(ar)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(c.retainerBalance ?? 0)}</td>
                  <td className="px-4 py-2"><Button variant="ghost" size="sm" onClick={() => void update(c.id, { archived: true })}>Archive</Button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ClientDialog open={open} onOpenChange={setOpen} workspaceId={workspaceId} />
    </div>
  )
}
