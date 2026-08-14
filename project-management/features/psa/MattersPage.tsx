'use client'

/** Matters / engagements list. */
import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useClientsStore, useMattersStore, useProjectsStore, useTimeEntriesStore, useUsersStore } from '../../stores/entities'
import { wipTotal } from '../../lib/billing/selectors'
import { formatMoney } from '../../lib/billing/formatMoney'
import { entryHours } from '../../lib/psa/timeEntryUtils'
import { MatterDialog } from './matters/MatterDialog'
import { useWorkspacesStore } from '../../stores/entities'
import { matterTerminology } from '../../lib/psa/terminology'

export function MattersPage() {
  const { workspaceId } = useWorkspaceContext()
  const workspace = useWorkspacesStore((s) => workspaceId ? s.getById(workspaceId) : undefined)
  const terms = matterTerminology(workspace)
  const matters = useMattersStore((s) => s.list().filter((m) => m.workspaceId === workspaceId))
  const clients = useClientsStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const entries = useTimeEntriesStore((s) => s.list())
  const [open, setOpen] = useState(false)

  usePageMeta({ breadcrumbs: [{ label: terms.plural }] })

  if (!workspaceId) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-2xl">{terms.plural}</h1>
        <Button className="tl-btn-primary border-0" size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New {terms.singular.toLowerCase()}</Button>
      </div>
      <div className="tl-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
            <th className="px-4 py-2">#</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Client</th>
            <th className="px-4 py-2">Practice</th><th className="px-4 py-2">Attorney</th><th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">WIP</th><th className="px-4 py-2">Flags</th>
          </tr></thead>
          <tbody>
            {matters.map((m) => {
              const project = projects.find((p) => p.id === m.projectId)
              const client = clients.find((c) => c.id === m.clientId)
              const attorney = users.find((u) => u.id === m.responsibleAttorneyId)
              const matterEntries = entries.filter((e) => e.matterId === m.id)
              const hours = matterEntries.reduce((s, e) => s + entryHours(e), 0)
              const wip = wipTotal(matterEntries, [])
              return (
                <tr key={m.id} className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <td className="px-4 py-2 font-mono tabular-nums">{m.matterNumber}</td>
                  <td className="px-4 py-2"><Link className="hover:underline" href={`/dashboard/project-management/w/${workspaceId}/psa/${terms.route}/${m.id}`}>{project?.name ?? '—'}</Link></td>
                  <td className="px-4 py-2">{client?.name ?? '—'}</td>
                  <td className="px-4 py-2">{m.practiceArea}</td>
                  <td className="px-4 py-2">{attorney?.name ?? '—'}</td>
                  <td className="px-4 py-2">{m.status}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(wip)} · {hours.toFixed(1)}h</td>
                  <td className="px-4 py-2 flex gap-1">
                    {m.utbmsEnabled && <Badge variant="outline">UTBMS</Badge>}
                    {m.trustEnabled && <Badge variant="secondary">Trust</Badge>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <MatterDialog open={open} onOpenChange={setOpen} workspaceId={workspaceId} />
    </div>
  )
}
