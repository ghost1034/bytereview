'use client'

import Link from 'next/link'
import { Database, FileText, Files, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { accent } from '@/components/pages/home/shared/tones'

const TONE = 'cyan'
const a = accent(TONE)

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
    <BrowserFrame
      label="Form Fill"
      rightSlot={
        <div className="flex items-center gap-1">
          <Sparkles className="size-3.5 text-accent-blue-300" aria-hidden />
          <span className="text-xs font-medium text-accent-blue-300">Filling…</span>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-0">
        <div className="border-r border-border bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <Database className="size-3.5 text-accent-blue-300" aria-hidden />
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
          <div className="mt-4 inline-flex items-center gap-1 rounded-md border border-accent-blue-400/20 bg-accent-blue-400/10 px-2 py-1.5 text-[11px] text-accent-blue-300">
            <FileText className="size-3" aria-hidden />
            Q4 Extraction Result.json
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <FileText className="size-3.5 text-accent-blue-300" aria-hidden />
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
                      ? 'truncate rounded border border-accent-blue-400/30 bg-accent-blue-400/10 px-2 py-1 font-medium text-accent-blue-200'
                      : 'rounded border border-dashed border-border-strong bg-surface px-2 py-1 italic text-foreground-subtle'
                  }
                >
                  {f.filled ? f.value : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-muted/60 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {['Fillable PDF', 'PDF Overlay', 'DOCX Placeholders'].map((s, i) => (
            <span
              key={s}
              className={
                i === 0
                  ? 'rounded-md border border-accent-blue-400/30 bg-accent-blue-400/10 px-2 py-1 text-xs font-medium text-accent-blue-200'
                  : 'rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground-muted'
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
    </BrowserFrame>
  )
}

export default function FormFillShowcase() {
  return (
    <SectionShell
      id="form-fill-showcase"
      surface="tint"
      eyebrow="Document automation"
      eyebrowIcon={Files}
      eyebrowTone={TONE}
      title={
        <>
          Form Fill: auto-fill documents from{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            your data
          </span>
        </>
      }
      description="Upload supporting information and a PDF or DOCX target, or send one selected extraction result directly into Form Fill."
      media={<FormFillMockup />}
    >
      <FeatureList items={HIGHLIGHTS} tone={TONE} className="pt-1" />
      <div className="pt-1">
        <Button
          asChild
          className="bg-accent-blue-500 text-white hover:bg-accent-blue-600"
        >
          <Link href="/dashboard/form-fill">Try Form Fill</Link>
        </Button>
      </div>
    </SectionShell>
  )
}
