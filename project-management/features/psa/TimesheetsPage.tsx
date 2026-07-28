'use client'

/** Timesheets overview — submitted/approved history. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useTimesheetsStore, useUsersStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { Badge } from '@/components/ui/badge'

export function TimesheetsPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const sheets = useTimesheetsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const users = useUsersStore((s) => s.list())

  usePageMeta({ breadcrumbs: [{ label: 'Timesheets' }] })

  if (!workspaceId) return null

  const mine = sheets.filter((s) => s.userId === userId)

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Timesheets</h1>
      <div className="tl-card overflow-hidden shadow-paper-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="px-4 py-2">User</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">Hours</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Util %</th>
          </tr></thead>
          <tbody>
            {sheets.sort((a, b) => b.periodStart.localeCompare(a.periodStart)).map((s) => {
              const user = users.find((u) => u.id === s.userId)
              return (
                <tr key={s.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="px-4 py-2">{user?.name ?? s.userId}{s.userId === userId ? ' (you)' : ''}</td>
                  <td className="px-4 py-2 font-mono tabular-nums">{s.periodStart} — {s.periodEnd}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{s.status}</Badge></td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{s.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(s.totalAmount)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{s.utilizationPercent.toFixed(0)}%</td>
                </tr>
              )
            })}
            {mine.length === 0 && sheets.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--ink-muted)' }}>No timesheets yet. Submit from Time → My week.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
