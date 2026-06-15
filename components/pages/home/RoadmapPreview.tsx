'use client'

import { motion } from 'framer-motion'
import { FolderKanban } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const MILESTONES = [
  {
    icon: FolderKanban,
    tone: 'brand' as const,
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
    <section
      id="roadmap"
      className="relative isolate overflow-hidden bg-surface py-24"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 size-[460px] -translate-x-1/2 rounded-full bg-accent-blue-500/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-14 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Badge
            variant="secondary"
            className="mb-4 rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-blue-300"
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
          {MILESTONES.length > 1 && (
            <div
              className="absolute left-[23px] top-6 bottom-6 hidden w-px bg-gradient-to-b from-accent-blue-400/50 to-border md:block"
              aria-hidden
            />
          )}

          {MILESTONES.map((m) => (
            <motion.div
              key={m.title}
              className="relative flex items-start gap-6"
              variants={staggerChild}
            >
              <div className="relative z-10 shrink-0">
                <span
                  className="flex size-12 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 shadow-glow ring-1 ring-accent-blue-400/20"
                  aria-hidden
                >
                  <m.icon className="size-5" />
                </span>
              </div>
              <div className="glass-card flex-1 rounded-2xl border-l-4 border-l-accent-blue-400/50 p-6">
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {m.title}
                </h3>
                <p className="mb-4 text-foreground-muted">{m.description}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {m.capabilities.map((cap) => (
                    <div key={cap} className="flex items-start gap-2 text-sm">
                      <span
                        className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-accent-blue-400"
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
