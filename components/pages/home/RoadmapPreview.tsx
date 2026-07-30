'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { staggerChild, staggerContainer, viewportOnce } from '@/lib/animations'

const MILESTONES = [
  {
    icon: Sparkles,
    title: 'More productivity tools',
    description:
      'AI-powered month-end checklists, slide decks, and expense reimbursement workflows.',
    capabilities: [
      'Month-end close checklists with progress tracking',
      'AI-generated slide presentations from data',
      'Expense reimbursement processing',
      'Review and approval workflows',
    ],
  },
]

export default function RoadmapPreview() {
  return (
    <SectionShell
      id="roadmap"
      surface="transparent"
      width="narrow"
      eyebrow="Roadmap"
      title="What's coming next"
      description="We're building the tools professional services teams have been waiting for."
      background={
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 size-[460px] -translate-x-1/2 rounded-full bg-accent-blue-500/10 blur-3xl"
        />
      }
    >
      <motion.div
        className="space-y-6"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {MILESTONES.map((m) => (
          <motion.div
            key={m.title}
            variants={staggerChild}
            className="glass-card rounded-2xl border-dashed p-8"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
                aria-hidden
              >
                <m.icon className="size-6" />
              </span>
              <div className="flex-1">
                <span className="mb-3 inline-flex items-center rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-foreground-subtle">
                  Coming soon
                </span>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  {m.title}
                </h3>
                <p className="mt-2 text-foreground-muted">{m.description}</p>
                <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {m.capabilities.map((cap) => (
                    <div key={cap} className="flex items-start gap-2 text-sm">
                      <Check
                        className={cn(
                          'mt-0.5 size-4 shrink-0 text-accent-blue-400',
                        )}
                        aria-hidden
                      />
                      <span className="text-foreground-muted">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  )
}
