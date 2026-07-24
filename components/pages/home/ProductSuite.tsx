'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Clock,
  FileSignature,
  FileText,
  Files,
  LayoutGrid,
  PenTool,
} from 'lucide-react'

import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent, type Accent } from '@/components/pages/home/shared/tones'
import {
  hoverLift,
  staggerChild,
  staggerContainerSlow,
  viewportOnce,
} from '@/lib/animations'
import { cn } from '@/lib/utils'

type Status = 'Available now' | 'Beta' | 'Coming soon'

interface Product {
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /** Identity hue — gives each product a distinct accent across the page. */
  tone: Accent
  status: Status
  href: string
  /** Flagship card gets a glow border + larger icon (no column span — keeps the grid balanced). */
  featured?: boolean
}

const PRODUCTS: Product[] = [
  {
    name: 'Universal Document Analysis',
    description:
      'Extract, analyze, and automate any document type with AI precision.',
    icon: FileText,
    tone: 'blue',
    status: 'Available now',
    href: '#extraction-features',
    featured: true,
  },
  {
    name: 'Form Fill',
    description:
      'Auto-fill PDFs and Word documents from extraction results, uploaded sources, or saved templates.',
    icon: Files,
    tone: 'cyan',
    status: 'Available now',
    href: '#form-fill-showcase',
  },
  {
    name: 'Inkwise',
    description:
      'AI-powered writing with citation-grounded references from your own documents.',
    icon: PenTool,
    tone: 'violet',
    status: 'Available now',
    href: '#inkwise-showcase',
  },
  {
    name: 'E-Signature',
    description:
      'Prepare, send, sign, and track documents with reusable templates and completion evidence.',
    icon: FileSignature,
    tone: 'rose',
    status: 'Beta',
    href: '#esign-showcase',
  },
  {
    name: 'Chrona',
    description:
      'Automatic time tracking that syncs AI-built daily timelines from staff devices into your firm dashboard.',
    icon: Clock,
    tone: 'emerald',
    status: 'Available now',
    href: '#chrona-showcase',
  },
  {
    name: 'AccountingClaw / FinanceClaw / LegalClaw',
    description:
      'Digital workers with hundreds of pre-built skills for regulated industries.',
    icon: Bot,
    tone: 'amber',
    status: 'Available now',
    href: '#claw-showcase',
  },
  {
    name: 'AI Analytics Suite',
    description:
      'Variance & flux analysis, reconciliation, fixed assets, and distribution waterfalls — with IRS/GAAP research bots and a context-aware AI assistant.',
    icon: BarChart3,
    tone: 'sky',
    status: 'Available now',
    href: '#analytics-showcase',
  },
]

function StatusBadge({ status }: { status: Status }) {
  if (status === 'Coming soon') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-foreground-subtle">
        Coming soon
      </span>
    )
  }
  if (status === 'Beta') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[11px] font-medium text-rose-300">
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_#fb7185]"
        />
        Beta
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 px-2.5 py-1 text-[11px] font-medium text-accent-blue-300">
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-accent-blue-400 shadow-[0_0_6px_#6E97F7]"
      />
      Available now
    </span>
  )
}

export default function ProductSuite() {
  return (
    <SectionShell
      id="product-suite"
      surface="transparent"
      eyebrow="Full product suite"
      eyebrowIcon={LayoutGrid}
      title="One platform, every tool you need"
      description="Purpose-built for accounting, finance, and legal teams — from document processing to autonomous AI agents."
    >
      <motion.div
        className="grid auto-rows-fr grid-cols-1 gap-5 md:grid-cols-4 lg:grid-cols-8"
        variants={staggerContainerSlow}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {PRODUCTS.map((product, index) => {
          const Icon = product.icon
          const a = accent(product.tone)

          return (
            <motion.div
              key={product.name}
              variants={staggerChild}
              {...hoverLift}
              className={cn(
                'h-full md:col-span-2 lg:col-span-2',
                // Center the single final card at tablet widths.
                index === PRODUCTS.length - 1 &&
                  'md:col-start-2 lg:col-start-auto',
                // Four cards above, then three equal-width cards centered below.
                index === 4 && 'lg:col-start-2',
              )}
            >
              <a
                href={product.href}
                className={cn(
                  'group glass-card relative flex h-full flex-col rounded-2xl p-6 transition-all duration-300',
                  'hover:-translate-y-0.5 hover:shadow-glow',
                  a.hoverBorder,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                )}
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex items-center justify-center rounded-xl transition-colors',
                      a.chip,
                      product.featured ? 'size-12' : 'size-11',
                    )}
                  >
                    <Icon className={product.featured ? 'size-6' : 'size-5'} />
                  </span>
                  <StatusBadge status={product.status} />
                </div>

                <h3
                  className={cn(
                    'mb-2 font-semibold text-foreground',
                    product.featured ? 'text-xl' : 'text-lg',
                  )}
                >
                  {product.name}
                </h3>
                <p className="text-sm text-foreground-muted">
                  {product.description}
                </p>

                <span
                  className={cn(
                    'mt-auto flex items-center gap-1 pt-5 text-sm font-medium opacity-0 transition-all duration-300 group-hover:opacity-100',
                    a.text,
                  )}
                >
                  Explore
                  <ArrowUpRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </span>
              </a>
            </motion.div>
          )
        })}
      </motion.div>
    </SectionShell>
  )
}
