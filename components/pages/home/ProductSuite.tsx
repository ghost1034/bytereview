'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  BarChart3,
  Bot,
  Clock,
  FileText,
  Files,
  FolderKanban,
  PenTool,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { IconTile } from '@/components/ui/icon-tile'
import {
  fadeInUp,
  hoverLift,
  staggerChild,
  staggerContainerSlow,
  viewportOnce,
} from '@/lib/animations'
import { cn } from '@/lib/utils'

type Tone =
  | 'brand'
  | 'success'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'formfill'
  | 'inkwise'
  | 'chrona'
  | 'claw'
  | 'analysis'
  | 'productivity'
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
  },
  {
    name: 'Form Fill',
    description:
      'Auto-fill PDFs and Word documents from extraction results, uploaded sources, or saved templates.',
    icon: Files,
    tone: 'formfill',
    status: 'Available',
    href: '#form-fill-showcase',
  },
  {
    name: 'Inkwise',
    description:
      'AI-powered writing with citation-grounded references from your own documents.',
    icon: PenTool,
    tone: 'inkwise',
    status: 'Available',
    href: '#inkwise-showcase',
  },
  {
    name: 'Chrona',
    description:
      'Automatic time tracking that turns your screen into a structured daily timeline.',
    icon: Clock,
    tone: 'chrona',
    status: 'Coming Soon',
    href: '#chrona-showcase',
  },
  {
    name: 'AccountingClaw / FinanceClaw / LegalClaw',
    description:
      'Digital workers with hundreds of pre-built skills for regulated industries.',
    icon: Bot,
    tone: 'claw',
    status: 'Coming Soon',
    href: '#claw-showcase',
  },
  {
    name: 'AI Analysis & Productivity Suites',
    description:
      'Reconciliation, flux analysis, project management, month-end checklists, and more.',
    icon: BarChart3,
    tone: 'analysis',
    status: 'Coming Soon',
    href: '#roadmap',
    secondaryIcon: FolderKanban,
    secondaryTone: 'productivity',
  },
]

export default function ProductSuite() {
  return (
    <section id="product-suite" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-14 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Badge
            variant="secondary"
            className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
          >
            Full product suite
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            One platform, every tool you need
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-balance text-lg text-foreground-muted">
            Purpose-built for accounting, finance, and legal teams — from
            document processing to autonomous AI agents.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
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
            const wrapperProps: any = isAnchor
              ? { href: product.href }
              : { href: product.href }

            return (
              <motion.div
                key={product.name}
                variants={staggerChild}
                {...hoverLift}
              >
                <Wrapper
                  {...wrapperProps}
                  className={cn(
                    'group relative block h-full rounded-xl border border-border bg-surface-raised p-6 shadow-xs transition-all',
                    'hover:border-border-strong hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  <div className="absolute right-4 top-4">
                    {product.status === 'Coming Soon' ? (
                      <Badge variant="secondary" className="text-[11px]">
                        Coming soon
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/20 bg-success-soft text-[11px] text-success"
                      >
                        Available
                      </Badge>
                    )}
                  </div>

                  <div className="mb-4 flex items-center gap-2">
                    <IconTile icon={Icon} tone={product.tone} size="lg" />
                    {SecondaryIcon && (
                      <IconTile
                        icon={SecondaryIcon}
                        tone={product.secondaryTone ?? 'info'}
                        size="lg"
                      />
                    )}
                  </div>

                  <h3 className="mb-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                    {product.name}
                  </h3>
                  <p className="text-sm text-foreground-muted">
                    {product.description}
                  </p>
                </Wrapper>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
