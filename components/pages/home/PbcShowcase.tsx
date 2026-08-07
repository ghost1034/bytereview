'use client'

import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileArchive,
  MessageSquareText,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent } from '@/components/pages/home/shared/tones'
import { cn } from '@/lib/utils'

const TONE = 'teal'
const a = accent(TONE)

const HIGHLIGHTS = [
  { title: 'Build request lists from firm templates, spreadsheets, or AI suggestions' },
  { title: 'Give clients a secure, account-free portal for uploads and responses' },
  { title: 'Keep versioned evidence, comments, reminders, and review status together' },
  { title: 'Export a live tracker or a complete, audit-ready evidence package' },
]

const REQUESTS = [
  {
    number: 'PBC-001',
    title: 'Bank reconciliations',
    detail: 'Cash · Alex Morgan',
    status: 'Accepted',
    files: 4,
    icon: CheckCircle2,
    statusClass: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  },
  {
    number: 'PBC-002',
    title: 'Revenue support',
    detail: 'Revenue · Jamie Lee',
    status: 'Submitted',
    files: 2,
    icon: UploadCloud,
    statusClass: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  },
  {
    number: 'PBC-003',
    title: 'Lease agreements',
    detail: 'Leases · Taylor Kim',
    status: 'Needs changes',
    files: 1,
    icon: MessageSquareText,
    statusClass: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  },
  {
    number: 'PBC-004',
    title: 'Legal representation letter',
    detail: 'Legal · Unassigned',
    status: 'Open',
    files: 0,
    icon: Clock3,
    statusClass: 'border-border-strong bg-surface-muted text-foreground-muted',
  },
]

function PbcMockup() {
  return (
    <BrowserFrame
      label="PBC · 2026 Financial Statement Audit"
      rightSlot={
        <div className="flex items-center gap-1 text-teal-300">
          <ShieldCheck className="size-3.5" aria-hidden />
          <span className="text-xs font-medium">Secure portal active</span>
        </div>
      }
    >
      <div className="border-b border-border bg-surface/40 px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Acme Holdings, LLC</p>
            <p className="mt-0.5 text-[11px] text-foreground-subtle">
              Period ended December 31, 2025
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-teal-300">68%</p>
            <p className="text-[10px] text-foreground-subtle">complete</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full w-[68%] rounded-full bg-teal-400" />
        </div>
      </div>

      <div className="bg-surface/20 p-3 sm:p-4">
        <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
          <div className="grid grid-cols-[58px_minmax(0,1fr)_auto] gap-2 border-b border-border bg-surface-muted/60 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-foreground-subtle sm:grid-cols-[70px_minmax(0,1fr)_92px_42px]">
            <span>Number</span>
            <span>Request</span>
            <span>Status</span>
            <span className="hidden text-right sm:block">Files</span>
          </div>
          <div className="divide-y divide-border">
            {REQUESTS.map((request) => {
              const Icon = request.icon
              return (
                <div
                  key={request.number}
                  className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[70px_minmax(0,1fr)_92px_42px]"
                >
                  <span className="font-mono text-[9px] text-foreground-subtle">
                    {request.number}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {request.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[9px] text-foreground-subtle">
                      {request.detail}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-1 text-[8px] font-medium',
                      request.statusClass,
                    )}
                  >
                    <Icon className="size-2.5" aria-hidden />
                    {request.status}
                  </span>
                  <span className="hidden text-right text-[10px] tabular-nums text-foreground-muted sm:block">
                    {request.files}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-teal-400/10 px-4 py-3 text-[10px] text-teal-200">
        <span className="inline-flex items-center gap-1.5">
          <Bot className="size-3.5 text-teal-300" aria-hidden />
          AI completeness review: 1 item needs attention
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-teal-300">
          <FileArchive className="size-3.5" aria-hidden />
          Evidence package ready
        </span>
      </div>
    </BrowserFrame>
  )
}

interface PbcShowcaseProps {
  onTryProduct: (destination: string) => void
}

export default function PbcShowcase({ onTryProduct }: PbcShowcaseProps) {
  return (
    <SectionShell
      id="pbc-showcase"
      surface="transparent"
      reverse
      eyebrow="Prepared by Client"
      eyebrowIcon={ClipboardCheck}
      eyebrowTone={TONE}
      title={
        <>
          Client evidence collection,{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            without the spreadsheet chase
          </span>
        </>
      }
      description="Create a clear PBC request list, collect files through a secure client portal, and move every item from request to accepted evidence in one workspace."
      media={<PbcMockup />}
    >
      <FeatureList items={HIGHLIGHTS} tone={TONE} className="pt-1" />
      <div className="pt-1">
        <Button
          onClick={() => onTryProduct('/dashboard/pbc')}
          className="bg-teal-500 text-white hover:bg-teal-600"
        >
          Try PBC
        </Button>
      </div>
    </SectionShell>
  )
}
