'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Clock,
  FileText,
  Files,
  LayoutGrid,
  PenTool,
} from 'lucide-react'

import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import {
  hoverLift,
  staggerChild,
  staggerContainerSlow,
  viewportOnce,
} from '@/lib/animations'
import { cn } from '@/lib/utils'

type Tone = 'brand' | 'success' | 'warning' | 'info' | 'neutral'
type Status = 'Available' | 'Coming Soon'

interface Product {
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tone: Tone
  status: Status
  href: string
  secondaryIcon?: React.ComponentType<{ className?: string }>
  secondaryTone?: Tone
  /** Featured card spans two columns on large screens. */
  featured?: boolean
}

const PRODUCTS: Product[] = [
  {
    name: 'Universal Document Analysis',
    description:
      'Extract, analyze, and automate any document type with AI precision.',
    icon: FileText,
    tone: 'brand',
    status: 'Available',
    href: '#extraction-features',
    featured: true,
  },
  {
    name: 'Form Fill',
    description:
      'Auto-fill PDFs and Word documents from extraction results, uploaded sources, or saved templates.',
    icon: Files,
    tone: 'brand',
    status: 'Available',
    href: '#form-fill-showcase',
  },
  {
    name: 'Inkwise',
    description:
      'AI-powered writing with citation-grounded references from your own documents.',
    icon: PenTool,
    tone: 'brand',
    status: 'Available',
    href: '#inkwise-showcase',
  },
  {
    name: 'Chrona',
    description:
      'Automatic time tracking that syncs AI-built daily timelines from staff devices into your firm dashboard.',
    icon: Clock,
    tone: 'brand',
    status: 'Available',
    href: '#chrona-showcase',
  },
  {
    name: 'AccountingClaw / FinanceClaw / LegalClaw',
    description:
      'Digital workers with hundreds of pre-built skills for regulated industries.',
    icon: Bot,
    tone: 'brand',
    status: 'Available',
    href: '/claw',
  },
  {
    name: 'AI Analytics Suite',
    description:
      'Variance & flux analysis, reconciliation, fixed assets, and distribution waterfalls — with IRS/GAAP research bots and a context-aware AI assistant.',
    icon: BarChart3,
    tone: 'brand',
    status: 'Available',
    href: '#analytics-showcase',
  },
]

function StatusBadge({ status }: { status: Status }) {
  if (status === 'Coming Soon') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-foreground-subtle">
        Coming soon
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 px-2.5 py-1 text-[11px] font-medium text-accent-blue-300">
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-accent-blue-400 shadow-[0_0_6px_#6E97F7]"
      />
      Available
    </span>
  )
}

export default function ProductSuite() {
  return (
    <SectionShell
      id="product-suite"
      surface="background"
      eyebrow="Full product suite"
      eyebrowIcon={LayoutGrid}
      title="One platform, every tool you need"
      description="Purpose-built for accounting, finance, and legal teams — from document processing to autonomous AI agents."
    >
      <motion.div
        className="grid auto-rows-fr grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
        variants={staggerContainerSlow}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {PRODUCTS.map((product) => {
          const Icon = product.icon
          const SecondaryIcon = product.secondaryIcon
          const isAnchor = product.href.startsWith('#')
          const Wrapper: any = isAnchor ? 'a' : Link

          return (
            <motion.div
              key={product.name}
              variants={staggerChild}
              {...hoverLift}
              className={cn(
                'h-full',
                product.featured && 'md:col-span-2 lg:col-span-2',
              )}
            >
              <Wrapper
                href={product.href}
                className={cn(
                  'group glass-card relative flex h-full flex-col rounded-2xl p-6 transition-all duration-300',
                  'hover:-translate-y-0.5 hover:border-accent-blue-400/40 hover:shadow-glow',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  product.featured &&
                    'border-accent-blue-400/30 shadow-glow sm:p-8',
                )}
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20 transition-colors group-hover:bg-accent-blue-400/15 group-hover:ring-accent-blue-400/40',
                        product.featured ? 'size-12' : 'size-11',
                      )}
                    >
                      <Icon
                        className={product.featured ? 'size-6' : 'size-5'}
                      />
                    </span>
                    {SecondaryIcon && (
                      <span
                        aria-hidden
                        className="inline-flex size-11 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
                      >
                        <SecondaryIcon className="size-5" />
                      </span>
                    )}
                  </div>
                  <StatusBadge status={product.status} />
                </div>

                <h3
                  className={cn(
                    'mb-2 font-semibold text-foreground transition-colors group-hover:text-accent-blue-300',
                    product.featured ? 'text-xl sm:text-2xl' : 'text-lg',
                  )}
                >
                  {product.name}
                </h3>
                <p
                  className={cn(
                    'text-foreground-muted',
                    product.featured ? 'max-w-xl text-base' : 'text-sm',
                  )}
                >
                  {product.description}
                </p>

                <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-medium text-accent-blue-300 opacity-0 transition-all duration-300 group-hover:opacity-100">
                  Explore
                  <ArrowUpRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </span>
              </Wrapper>
            </motion.div>
          )
        })}
      </motion.div>
    </SectionShell>
  )
}
