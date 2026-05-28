import { CheckCircle2, Clock, FileCheck, FolderKanban, RefreshCcw } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { KpiCounts } from './types'

interface KpiCardProps {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'neutral' | 'warning' | 'info' | 'success' | 'finalized'
}

const TONE_CLASSES: Record<KpiCardProps['tone'], string> = {
  neutral: 'bg-surface-muted text-foreground-muted',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  finalized: 'bg-purple-100 text-purple-700',
}

function KpiCard({ label, value, icon: Icon, tone }: KpiCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-xl',
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-3xl font-bold text-foreground">{value}</h3>
        <p className="text-xs font-medium uppercase tracking-widest text-foreground-subtle">
          {label}
        </p>
      </div>
    </div>
  )
}

export function DashboardKpiCards({ counts }: { counts: KpiCounts }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      <KpiCard label="Total Projects" value={counts.total} icon={FolderKanban} tone="neutral" />
      <KpiCard label="Pending Review" value={counts.pending} icon={Clock} tone="warning" />
      <KpiCard label="In Prep" value={counts.inPrep} icon={RefreshCcw} tone="info" />
      <KpiCard label="Approved" value={counts.approved} icon={CheckCircle2} tone="success" />
      <KpiCard label="Finalized" value={counts.finalized} icon={FileCheck} tone="finalized" />
    </div>
  )
}
