'use client'

import Link from 'next/link'
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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

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

export default function AnalyticsShowcase() {
  return (
    <section id="analytics-showcase" className="bg-surface-muted py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-12 text-center"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <Badge
              variant="secondary"
              className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
            >
              <BarChart3 className="mr-1.5 size-3" aria-hidden />
              Now available
            </Badge>
          </motion.div>
          <motion.h2
            className="mb-4 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
            variants={staggerChild}
          >
            Financial analysis,{' '}
            <span className="bg-gradient-to-r from-primary to-marketing-hero-accent bg-clip-text text-transparent">
              automated
            </span>
          </motion.h2>
          <motion.p
            className="mx-auto max-w-2xl text-balance text-lg text-foreground-muted"
            variants={staggerChild}
          >
            Variance and flux analysis, reconciliation, fixed assets, and
            distribution waterfalls — plus research bots and a context-aware
            assistant, all connected to your clients and built for accounting
            and finance teams.
          </motion.p>
        </motion.div>

        <motion.div
          className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.label}
              variants={staggerChild}
              className="rounded-xl border border-border bg-surface-raised p-5 shadow-xs"
            >
              <div className="flex items-start gap-3">
                <IconTile icon={f.icon} tone="brand" size="md" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {f.label}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {f.detail}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Button asChild>
            <Link href="/dashboard/analytics">Open the Analytics Suite →</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
