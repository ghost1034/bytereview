'use client'

import { Download, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { Section } from '@/components/ui/section'
import { useAuditLogs } from '@/hooks/useAnalyticsSettings'
import { useToast } from '@/hooks/use-toast'
import type { AnalyticsAuditLogEntry } from '@/lib/analytics/types'

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildCsv(entries: AnalyticsAuditLogEntry[]): string {
  const headers = ['Timestamp', 'Action', 'User', 'Email', 'Details']
  const rows = entries.map((entry) =>
    [
      entry.created_at,
      entry.action,
      entry.user_display_name ?? '',
      entry.user_email ?? '',
      entry.details ? JSON.stringify(entry.details) : '',
    ]
      .map(csvEscape)
      .join(','),
  )
  return [headers.join(','), ...rows].join('\n')
}

function formatDetails(details: AnalyticsAuditLogEntry['details']): string {
  if (!details) return ''
  if (typeof details === 'string') return details
  try {
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' • ')
  } catch {
    return ''
  }
}

export function AuditLogTab() {
  const { data, isLoading } = useAuditLogs(50)
  const { toast } = useToast()
  const entries = data?.entries ?? []

  const handleDownload = () => {
    if (entries.length === 0) {
      toast({
        title: 'No logs',
        description: 'There are no audit log entries to export yet.',
      })
      return
    }
    const csv = buildCsv(entries)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Section
      variant="card"
      title="Audit logger"
      description="A continuous, immutable record of analytics actions taken in this firm. Showing the 50 most recent entries."
      action={
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={entries.length === 0}
        >
          <Download className="mr-1.5 size-4" aria-hidden />
          Download CSV
        </Button>
      }
    >
      {isLoading ? (
        <LoadingState variant="list" label="Loading audit logs" />
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface-muted/40 p-4 text-center text-sm text-foreground-muted">
          No audit log entries yet. Actions like creating a client or editing a project will show up here.
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <FileText
                className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{entry.action}</span>
                  <span className="text-xs text-foreground-subtle">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
                {entry.details && (
                  <div className="mt-0.5 truncate text-xs text-foreground-muted">
                    {formatDetails(entry.details)}
                  </div>
                )}
                {(entry.user_email || entry.user_display_name) && (
                  <div className="mt-0.5 text-xs text-foreground-subtle">
                    By: {entry.user_display_name || entry.user_email}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
