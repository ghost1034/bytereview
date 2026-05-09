'use client'

import Link from 'next/link'
import { AlignLeft, Bold, Italic, List, PenTool, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShowcaseSection } from '@/components/marketing/showcase-section'

const HIGHLIGHTS = [
  { title: 'Citation-backed drafting grounded in your documents' },
  { title: 'PDF and Word document references' },
  { title: 'Image, video & audio support coming soon' },
  { title: 'Accounting, finance & legal templates included' },
]

function InkwiseMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="ml-2 text-xs text-foreground-subtle">
            Inkwise Editor
          </span>
        </div>
        <div className="flex items-center gap-1 text-foreground-muted">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium text-primary">AI active</span>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        {[Bold, Italic, List, AlignLeft].map((Icon, i) => (
          <span
            key={i}
            className="flex size-7 items-center justify-center rounded text-foreground-muted hover:bg-surface-muted"
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ))}
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="flex items-center gap-1 rounded bg-primary-soft px-2 py-1 text-xs font-medium text-primary-soft-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          Write with AI
        </span>
      </div>

      <div className="min-h-[280px] space-y-4 p-6 text-sm text-foreground">
        <p className="text-base font-semibold text-foreground">
          Quarterly Investment Review — Q4 2024
        </p>
        <p className="leading-relaxed text-foreground-muted">
          Based on the portfolio statements provided, total AUM increased by
          12.3% relative to the prior quarter.
          <span className="ml-1 inline-flex cursor-pointer items-center rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-soft-foreground transition-colors hover:bg-primary-soft/80">
            [1]
          </span>
        </p>
        <p className="leading-relaxed text-foreground-muted">
          The largest contributor to growth was the technology sector
          allocation, which returned 18.7% during the period.
          <span className="ml-1 inline-flex cursor-pointer items-center rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-soft-foreground transition-colors hover:bg-primary-soft/80">
            [2]
          </span>
        </p>
        <p className="leading-relaxed text-foreground-muted">
          Fixed-income allocations underperformed benchmark by 1.2%, driven by
          rising interest rate expectations.
          <span className="ml-1 inline-flex cursor-pointer items-center rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-soft-foreground transition-colors hover:bg-primary-soft/80">
            [3]
          </span>
        </p>

        <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-soft p-3 text-xs text-info">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong>AI suggestion:</strong> Consider noting the fixed-income
            underperformance highlighted in the Morgan Stanley report (Ref 3,
            p.12) and recommending a portfolio rebalance.
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-muted px-4 py-3">
        <p className="mb-2 text-xs font-medium text-foreground-muted">
          References (3 sources)
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'Q4 Portfolio Statement.pdf',
            'Sector Analysis Report.docx',
            'Morgan Stanley Review.pdf',
          ].map((ref) => (
            <span
              key={ref}
              className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground-muted"
            >
              {ref}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function InkwiseShowcase() {
  return (
    <ShowcaseSection
      surface="surface-muted"
      reverse
      eyebrow={
        <Badge variant="secondary" className="rounded-full">
          <PenTool className="mr-1.5 size-3" aria-hidden />
          Available now
        </Badge>
      }
      title={
        <>
          Inkwise: AI writing grounded in{' '}
          <span className="bg-gradient-to-r from-primary to-marketing-hero-accent bg-clip-text text-transparent">
            your documents
          </span>
        </>
      }
      description="The first multimodal retrieval-based writing tool in the market. Draft memos, reports, and analyses with AI that cites your own source materials."
      features={HIGHLIGHTS}
      cta={
        <Button asChild>
          <Link href="/dashboard/inkwise">Try Inkwise →</Link>
        </Button>
      }
      media={<InkwiseMockup />}
    />
  )
}
