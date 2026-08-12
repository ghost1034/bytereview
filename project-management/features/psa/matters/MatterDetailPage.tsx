'use client'

import Link from 'next/link'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { useClientsStore, useExpensesStore, useMattersStore, useProjectsStore, useTimeEntriesStore, useUsersStore } from '../../../stores/entities'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { wipTotal } from '../../../lib/billing/selectors'
import { entryHours } from '../../../lib/psa/timeEntryUtils'
import { matterTerminology } from '../../../lib/psa/terminology'

export function MatterDetailPage({ matterId }: { matterId: string }) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const matter = useMattersStore((s) => s.getById(matterId))
  const project = useProjectsStore((s) => matter ? s.getById(matter.projectId) : undefined)
  const client = useClientsStore((s) => matter ? s.getById(matter.clientId) : undefined)
  const owner = useUsersStore((s) => matter ? s.getById(matter.responsibleAttorneyId) : undefined)
  const time = useTimeEntriesStore((s) => s.list().filter((e) => e.matterId === matterId))
  const expenses = useExpensesStore((s) => s.list().filter((e) => e.matterId === matterId))
  const terms = matterTerminology(workspace)
  usePageMeta({ breadcrumbs: [{ label: terms.plural }, { label: project?.name ?? terms.singular }] })
  if (!workspaceId || !matter || matter.workspaceId !== workspaceId) return <p>{terms.singular} not found.</p>
  return <div className="space-y-5">
    <div><p className="font-mono text-xs" style={{ color: 'var(--ink-muted)' }}>{matter.matterNumber}</p><h1 className="font-serif text-2xl">{project?.name ?? terms.singular}</h1><Link className="text-sm underline" href={`/dashboard/project-management/w/${workspaceId}/psa/clients/${matter.clientId}`}>{client?.name ?? 'Client'}</Link></div>
    <div className="grid gap-3 sm:grid-cols-4"><Metric label="Status" value={matter.status} /><Metric label="Responsible" value={owner?.name ?? '—'} /><Metric label="Hours" value={`${time.reduce((s, e) => s + entryHours(e), 0).toFixed(2)}h`} /><Metric label="WIP" value={formatMoney(wipTotal(time, expenses))} /></div>
    <div className="tl-card grid gap-3 p-4 text-sm shadow-paper-sm sm:grid-cols-2"><p><b>Practice area</b><br />{matter.practiceArea}</p><p><b>Fee arrangement</b><br />{matter.feeArrangement}</p><p><b>Opened</b><br />{matter.openedAt}</p><p><b>Conflict status</b><br />{matter.conflictStatus}</p></div>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="tl-card p-4 shadow-paper-sm"><p className="text-xs uppercase" style={{ color: 'var(--ink-muted)' }}>{label}</p><p className="font-mono text-lg">{value}</p></div> }
