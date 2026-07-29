'use client'

import Link from 'next/link'
import {
  CheckCircle2,
  Clock3,
  FileSignature,
  FileText,
  MoreHorizontal,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent } from '@/components/pages/home/shared/tones'

const TONE = 'rose'
const a = accent(TONE)

const HIGHLIGHTS = [
  { title: 'Reusable templates, signing order, expiration dates, and reminders' },
  { title: 'Signature, initials, date, text, checkbox, attachment, and formula fields' },
  { title: 'Secure signing links for recipients — no CPAAutomation account required' },
  { title: 'Tamper-evident seals, audit trails, and certificates of completion' },
]

const ENVELOPES = [
  {
    title: '2026 Engagement Letter',
    recipients: 'Maya Chen · Jordan Lee',
    progress: '2/2 signed',
    status: 'Completed',
    icon: CheckCircle2,
  },
  {
    title: 'Q2 Representation Letter',
    recipients: 'Alex Rivera · Priya Shah',
    progress: '1/2 signed',
    status: 'In progress',
    icon: Clock3,
  },
  {
    title: 'Tax Organizer Consent',
    recipients: 'Sam Williams',
    progress: 'Ready to send',
    status: 'Draft',
    icon: FileText,
  },
]

function EsignMockup() {
  return (
    <BrowserFrame
      label="E-Signature"
      rightSlot={
        <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
          Beta
        </span>
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Envelopes</p>
          <p className="text-[11px] text-foreground-subtle">
            Track documents, recipients, and signing progress
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm">
          <Send className="size-3" aria-hidden />
          New envelope
        </span>
      </div>

      <div className="grid min-h-[292px] grid-cols-[112px_minmax(0,1fr)]">
        <div className="border-r border-border bg-surface-muted/50 p-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-foreground-subtle">
            Quick views
          </p>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between rounded-md bg-rose-400/10 px-2 py-1.5 font-medium text-rose-300">
              <span>All</span>
              <span>12</span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 text-foreground-muted">
              <span>Drafts</span>
              <span>3</span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 text-foreground-muted">
              <span>In progress</span>
              <span>4</span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 text-foreground-muted">
              <span>Completed</span>
              <span>5</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 divide-y divide-border">
          {ENVELOPES.map((envelope) => {
            const Icon = envelope.icon
            return (
              <div
                key={envelope.title}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-4"
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg',
                    envelope.status === 'Completed'
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : envelope.status === 'In progress'
                        ? 'bg-amber-400/10 text-amber-300'
                        : a.chip,
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {envelope.title}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-foreground-subtle">
                    {envelope.recipients}
                  </p>
                  <p className="mt-1 text-[10px] text-foreground-muted">
                    {envelope.progress}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                      envelope.status === 'Completed'
                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                        : envelope.status === 'In progress'
                          ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
                          : 'border-border-strong bg-surface-muted text-foreground-muted',
                    )}
                  >
                    {envelope.status}
                  </span>
                  <MoreHorizontal className="size-3.5 text-foreground-subtle" aria-hidden />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-border bg-border text-center">
        {[
          { icon: Users, label: 'Recipient routing' },
          { icon: ShieldCheck, label: 'Audit trail' },
          { icon: FileSignature, label: 'Digital seal' },
        ].map((item) => (
          <div key={item.label} className="bg-surface-muted/60 px-2 py-2.5">
            <item.icon className="mx-auto mb-1 size-3.5 text-rose-300" aria-hidden />
            <p className="text-[9px] font-medium text-foreground-muted">{item.label}</p>
          </div>
        ))}
      </div>
    </BrowserFrame>
  )
}

interface EsignShowcaseProps {
  onTryProduct: (destination: string) => void
}

export default function EsignShowcase({ onTryProduct }: EsignShowcaseProps) {
  return (
    <SectionShell
      id="esign-showcase"
      surface="tint-strong"
      eyebrow="E-Signature · Beta"
      eyebrowIcon={FileSignature}
      eyebrowTone={TONE}
      title={
        <>
          From prepared document to{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            completed signature
          </span>
        </>
      }
      description="Prepare and send signature requests, guide every recipient through a secure signing flow, and track the complete envelope lifecycle in one workspace."
      media={<EsignMockup />}
    >
      <FeatureList items={HIGHLIGHTS} tone={TONE} className="pt-1" />
      <div className="flex flex-wrap gap-3 pt-1">
        <Button
          onClick={() => onTryProduct('/dashboard/esign')}
          className="bg-rose-500 text-white hover:bg-rose-600"
        >
          Try E-Signature beta
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/e-signature/overview">Read the docs</Link>
        </Button>
      </div>
    </SectionShell>
  )
}
