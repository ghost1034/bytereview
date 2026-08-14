'use client'

/** Timesheets overview — submitted/approved history. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useTimesheetsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { canPerformWorkspaceAction } from '../../lib/permissions'
import { runPsaAction } from '../../lib/psa/actions'

export function TimesheetsPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const sheets = useTimesheetsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const users = useUsersStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => workspaceId ? s.getById(workspaceId) : undefined)
  const currentUser = users.find((candidate) => candidate.id === userId)
  const canBill = canPerformWorkspaceAction(currentUser, workspace, 'bill')

  usePageMeta({ breadcrumbs: [{ label: 'Timesheets' }] })

  if (!workspaceId) return null

  const mine = sheets.filter((s) => s.userId === userId)

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-2xl">Timesheets</h1>
      <div className="tl-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
            <th className="px-4 py-2">User</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">Hours</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Util %</th><th />
          </tr></thead>
          <tbody>
            {sheets.sort((a, b) => b.periodStart.localeCompare(a.periodStart)).map((s) => {
              const user = users.find((u) => u.id === s.userId)
              return (
                <tr key={s.id} className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <td className="px-4 py-2">{user?.name ?? s.userId}{s.userId === userId ? ' (you)' : ''}</td>
                  <td className="px-4 py-2 font-mono tabular-nums">{s.periodStart} — {s.periodEnd}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{s.status}</Badge></td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{s.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(s.totalAmount)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{s.utilizationPercent.toFixed(0)}%</td>
                  <td className="px-4 py-2">{canBill && ['approved', 'partially_approved'].includes(s.status) && <Button size="sm" variant="outline" onClick={() => void runPsaAction('timesheets', s.id, 'lock', workspaceId)}>Lock</Button>}</td>
                </tr>
              )
            })}
            {mine.length === 0 && sheets.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'hsl(var(--foreground-muted))' }}>No timesheets yet. Submit from Time → My week.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
