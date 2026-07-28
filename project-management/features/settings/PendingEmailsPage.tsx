'use client'

/** PendingEmailsPage — V1 queue of emails awaiting delivery. */
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { getEmailAdapter } from '../../lib/email'
import { formatRelative } from '../../lib/time'
import { usePendingEmailsStore } from '../../stores/entities'

export function PendingEmailsPage() {
  const { workspaceId } = useWorkspaceContext()
  const pending = usePendingEmailsStore((s) =>
    s.list().filter((row) => !workspaceId || row.workspaceId === workspaceId)
  )

  usePageMeta({ breadcrumbs: [{ label: 'Settings', href: '../settings' }, { label: 'Pending emails' }] })

  const dismiss = async (id: string) => {
    await getEmailAdapter().markSent(id)
    await usePendingEmailsStore.getState().remove(id)
  }

  if (!workspaceId) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Pending emails</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Queued messages while no external email provider is configured.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="tl-card flex flex-col items-center gap-3 p-10 text-center shadow-paper-sm">
          <Mail className="h-10 w-10" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.5} />
          <p className="font-medium">No pending emails</p>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            Invites and notifications will appear here in local development mode.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((row) => (
            <li key={row.id} className="tl-card p-4 shadow-paper-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.subject}</p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                    To: {row.to} · {row.category}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
                    Queued {formatRelative(row.createdAt)}
                  </p>
                  <div
                    className="mt-3 rounded-lg border p-3 text-sm"
                    style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-muted)' }}
                    dangerouslySetInnerHTML={{ __html: row.bodyHtml }}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => void dismiss(row.id)}>
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
