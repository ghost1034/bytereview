'use client'

/** Billing inquiries list for workspace admins. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { formatDate } from '../../lib/time'
import { useBillingInquiriesStore, useUsersStore } from '../../stores/entities'

export function BillingInquiriesPage() {
  const { workspaceId } = useWorkspaceContext()
  const inquiries = useBillingInquiriesStore((s) =>
    s.list().filter((i) => i.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const users = useUsersStore((s) => s.list())

  usePageMeta({ breadcrumbs: workspaceId ? [
    { label: 'Tasklytic', href: `/dashboard/project-management/w/${workspaceId}/home` },
    { label: 'Settings', href: `/dashboard/project-management/w/${workspaceId}/settings` },
    { label: 'Billing inquiries' },
  ] : [] })

  if (!workspaceId) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Billing inquiries</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>Contact-sales requests from upgrade and billing flows.</p>
      </div>
      {inquiries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No billing inquiries yet.</p>
      ) : (
        <ul className="space-y-2">
          {inquiries.map((row) => {
            const user = users.find((u) => u.id === row.userId)
            return (
              <li key={row.id} className="tl-card p-4 text-sm shadow-paper-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium capitalize">{row.type.replace('_', ' ')}</span>
                  <span className="text-xs capitalize" style={{ color: 'var(--ink-muted)' }}>{row.status}</span>
                </div>
                <p className="mt-1" style={{ color: 'var(--ink-secondary)' }}>
                  {user?.name ?? row.userId} · {formatDate(row.createdAt)}
                </p>
                {row.message && <p className="mt-2">{row.message}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
