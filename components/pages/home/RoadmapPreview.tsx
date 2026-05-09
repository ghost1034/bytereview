'use client'

import { motion } from 'framer-motion'
import { BarChart3, FolderKanban } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { IconTile } from '@/components/ui/icon-tile'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const MILESTONES = [
  {
    icon: BarChart3,
    tone: 'destructive' as const,
    title: 'AI Analysis Suite',
    description:
      'Automated reconciliation, flux analysis, amortization schedules, and distribution waterfalls.',
    capabilities: [
      'Multi-period flux analysis with variance explanations',
      'Amortization schedule generation',
      'Distribution waterfall calculations',
      'Automated reconciliation matching',
    ],
  },
  {
    icon: FolderKanban,
    tone: 'info' as const,
    title: 'AI Productivity Suite',
    description:
      'AI-powered project management, month-end checklists, slide decks, and expense reimbursement.',
    capabilities: [
      'Month-end close checklists with progress tracking',
      'AI-generated slide presentations from data',
      'Expense reimbursement processing',
      'Project timeline and task management',
    ],
  },
]

export default function RoadmapPreview() {
  return (
    <section id="roadmap" className="bg-background py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
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
            Roadmap
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            What&apos;s coming next
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-foreground-muted">
            We&apos;re building the tools professional services teams have been
            waiting for.
          </p>
        </motion.div>

        <motion.div
          className="relative space-y-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div
            className="absolute left-[23px] top-6 bottom-6 hidden w-px bg-gradient-to-b from-border-strong to-border md:block"
            aria-hidden
          />

          {MILESTONES.map((m, idx) => (
            <motion.div
              key={m.title}
              className="relative flex items-start gap-6"
              variants={staggerChild}
            >
              <div className="relative z-10 shrink-0">
                <IconTile icon={m.icon} tone={m.tone} size="lg" />
              </div>
              <div className="flex-1 rounded-xl border border-l-4 border-border bg-surface-muted p-6">
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {m.title}
                </h3>
                <p className="mb-4 text-foreground-muted">{m.description}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {m.capabilities.map((cap) => (
                    <div key={cap} className="flex items-start gap-2 text-sm">
                      <span
                        className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-foreground-subtle"
                        aria-hidden
                      />
                      <span className="text-foreground-muted">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
