'use client'

import { motion } from 'framer-motion'
import {
  BarChart3,
  BookOpen,
  Calculator,
  Droplet,
  GitMerge,
  LineChart,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent } from '@/components/pages/home/shared/tones'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const TONE = 'sky'
const a = accent(TONE)

const FEATURES = [
  {
    icon: LineChart,
    label: 'Variance & Flux Analysis',
    detail:
      'Multi-period variance with AI-generated explanations of what drove each change',
  },
  {
    icon: GitMerge,
    label: 'Reconciliation',
    detail:
      'Automated matching that surfaces breaks and unreconciled items for review',
  },
  {
    icon: Calculator,
    label: 'Fixed Assets & Amortization',
    detail:
      'Generate depreciation and amortization schedules from your asset data',
  },
  {
    icon: Droplet,
    label: 'Waterfall Analysis',
    detail: 'Model distribution waterfalls and tier allocations across periods',
  },
  {
    icon: BookOpen,
    label: 'IRS & GAAP Research Bots',
    detail:
      'Ask tax and accounting questions answered with web-grounded citations',
  },
  {
    icon: Sparkles,
    label: 'Context-aware AI Assistant',
    detail:
      'A floating assistant that understands the client and report you are viewing',
  },
]

interface AnalyticsShowcaseProps {
  onTryProduct: (destination: string) => void
}

export default function AnalyticsShowcase({ onTryProduct }: AnalyticsShowcaseProps) {
  return (
    <SectionShell
      id="analytics-showcase"
      surface="tint"
      eyebrow="Financial analysis"
      eyebrowIcon={BarChart3}
      eyebrowTone={TONE}
      title={
        <>
          Financial analysis,{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            automated
          </span>
        </>
      }
      description="Variance and flux analysis, reconciliation, fixed assets, and distribution waterfalls — plus research bots and a context-aware assistant, all connected to your clients and built for accounting and finance teams."
      background={
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/4 top-12 size-[480px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl"
        />
      }
    >
      {/* Single consolidated panel (distinct from the card-grid sections above).
          `gap-px` over a border-colored track draws clean hairline dividers. */}
      <motion.div
        className="overflow-hidden rounded-2xl border border-border shadow-glow"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <motion.div
          className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.label}
              variants={staggerChild}
              className="flex items-start gap-3 bg-surface-raised p-6 transition-colors hover:bg-surface-muted/60"
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg',
                  a.chip,
                )}
                aria-hidden
              >
                <f.icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {f.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
                  {f.detail}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      <motion.div
        className="mt-10 text-center"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <Button
          onClick={() => onTryProduct('/dashboard/analytics')}
          className="bg-accent-blue-500 text-white hover:bg-accent-blue-600"
        >
          Open the Analytics Suite
        </Button>
      </motion.div>
    </SectionShell>
  )
}
