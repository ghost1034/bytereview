'use client'

import Link from 'next/link'
import { Database, FileText, Files, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShowcaseSection } from '@/components/marketing/showcase-section'

const HIGHLIGHTS = [
  { title: 'Fillable PDF, PDF overlay, and DOCX placeholder strategies' },
  { title: 'Use extraction results as a structured data source' },
  { title: 'Save and reuse Form Fill templates' },
  { title: 'Output as PDF or DOCX' },
]

const SOURCE_FIELDS = [
  { label: 'Client Name', value: 'Acme Holdings, LLC' },
  { label: 'Tax ID', value: '47-1923847' },
  { label: 'Period End', value: '12/31/2025' },
  { label: 'Total Revenue', value: '$4,829,150' },
]

const TARGET_FIELDS = [
  { label: 'Entity Name', value: 'Acme Holdings, LLC', filled: true },
  { label: 'EIN', value: '47-1923847', filled: true },
  { label: 'Reporting Period', value: '12/31/2025', filled: true },
  { label: 'Gross Receipts', value: '$4,829,150', filled: true },
  { label: 'Signature', value: '', filled: false },
]

function FormFillMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="ml-2 text-xs text-foreground-subtle">Form Fill</span>
        </div>
        <div className="flex items-center gap-1 text-foreground-muted">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium text-primary">Filling…</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0">
        <div className="border-r border-border bg-surface-muted/40 p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <Database className="size-3.5 text-foreground-muted" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Source data
            </span>
          </div>
          <div className="space-y-2.5">
            {SOURCE_FIELDS.map((f) => (
              <div key={f.label} className="text-xs">
                <div className="text-foreground-subtle">{f.label}</div>
                <div className="truncate font-medium text-foreground">{f.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-[11px] text-foreground-muted">
            <FileText className="size-3" aria-hidden />
            Q4 Extraction Result.json
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <FileText className="size-3.5 text-primary" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Target form
            </span>
          </div>
          <div className="space-y-2.5">
            {TARGET_FIELDS.map((f) => (
              <div key={f.label} className="text-xs">
                <div className="mb-0.5 text-foreground-subtle">{f.label}</div>
                <div
                  className={
                    f.filled
                      ? 'truncate rounded border border-primary/20 bg-primary-soft px-2 py-1 font-medium text-primary-soft-foreground'
                      : 'rounded border border-dashed border-border bg-surface px-2 py-1 italic text-foreground-subtle'
                  }
                >
                  {f.filled ? f.value : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-muted px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {['Fillable PDF', 'PDF Overlay', 'DOCX Placeholders'].map((s, i) => (
            <span
              key={s}
              className={
                i === 0
                  ? 'rounded-md border border-primary/20 bg-primary-soft px-2 py-1 text-xs font-medium text-primary-soft-foreground'
                  : 'rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground-muted'
              }
            >
              {s}
            </span>
          ))}
        </div>
        <span className="text-xs text-foreground-muted">
          Output: <span className="font-medium text-foreground">PDF</span>
        </span>
      </div>
    </div>
  )
}

export default function FormFillShowcase() {
  return (
    <ShowcaseSection
      surface="surface"
      eyebrow={
        <Badge
          variant="secondary"
          className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
        >
          <Files className="mr-1.5 size-3" aria-hidden />
          Available now
        </Badge>
      }
      title={
        <>
          Form Fill: auto-fill documents from{' '}
          <span className="bg-gradient-to-r from-primary to-marketing-hero-accent bg-clip-text text-transparent">
            your data
          </span>
        </>
      }
      description="Upload supporting information and a PDF or DOCX target, or send one selected extraction result directly into Form Fill."
      features={HIGHLIGHTS}
      cta={
        <Button asChild>
          <Link href="/dashboard/form-fill">Try Form Fill →</Link>
        </Button>
      }
      media={<FormFillMockup />}
    />
  )
}
