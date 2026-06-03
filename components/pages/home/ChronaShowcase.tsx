'use client'

import { motion } from 'framer-motion'
import {
  BarChart3,
  BookOpen,
  Clock,
  LayoutDashboard,
  Search,
  Target,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { IconTile } from '@/components/ui/icon-tile'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const FEATURES = [
  {
    icon: Clock,
    label: 'Structured Timeline',
    detail: 'AI turns screen captures into time-aligned activity cards',
  },
  {
    icon: Target,
    label: 'Focus Reviews',
    detail: 'Rate time blocks as focused, neutral, or distracted',
  },
  {
    icon: Search,
    label: 'Natural Language Search',
    detail: 'Ask questions about your day with clickable source references',
  },
  {
    icon: BookOpen,
    label: 'AI Journal',
    detail: 'Auto-generated daily reflections grounded in your timeline',
  },
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    detail: 'Trends, category breakdowns, and longest focus streaks',
  },
  {
    icon: BarChart3,
    label: 'Analytics',
    detail: 'Tracked vs. untracked time across flexible date ranges',
  },
]

export default function ChronaShowcase() {
  return (
    <section
      id="chrona-showcase"
      className="relative overflow-hidden bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to py-24 text-marketing-hero-foreground"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-0 size-[500px] rounded-full bg-marketing-hero-accent/10 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-1/4 size-[400px] rounded-full bg-marketing-hero-accent/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-12 text-center"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <Badge
              variant="outline"
              className="mb-4 rounded-full border-marketing-hero-border bg-marketing-hero-accent/10 text-marketing-hero-foreground-muted"
            >
              <Clock className="mr-1.5 size-3" aria-hidden />
              Now available
            </Badge>
          </motion.div>
          <motion.h2
            className="mb-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            variants={staggerChild}
          >
            Chrona: know where your{' '}
            <span className="bg-gradient-to-r from-marketing-hero-accent to-marketing-hero-foreground bg-clip-text text-transparent">
              time goes
            </span>
          </motion.h2>
          <motion.p
            className="mx-auto max-w-2xl text-balance text-lg text-marketing-hero-foreground-muted"
            variants={staggerChild}
          >
            Automatic screen-based time tracking with AI-powered timeline
            generation. Everything stays local until you choose to analyze.
          </motion.p>
        </motion.div>

        <motion.div
          className="mb-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.label}
              variants={staggerChild}
              className="rounded-xl border border-marketing-hero-border bg-marketing-hero-from/30 p-5 backdrop-blur-sm"
            >
              <div className="flex items-start gap-3">
                <IconTile
                  icon={f.icon}
                  tone="brand"
                  size="md"
                  className="bg-marketing-hero-accent/15 text-marketing-hero-foreground ring-marketing-hero-border"
                />
                <div>
                  <p className="text-sm font-semibold text-marketing-hero-foreground">
                    {f.label}
                  </p>
                  <p className="mt-0.5 text-xs text-marketing-hero-foreground-muted">
                    {f.detail}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="mx-auto max-w-4xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="overflow-hidden rounded-xl border border-marketing-hero-border shadow-2xl shadow-black/30">
            <div className="flex items-center gap-1.5 border-b border-marketing-hero-border bg-marketing-hero-from/60 px-4 py-2">
              <span className="size-3 rounded-full bg-marketing-hero-foreground-muted/40" aria-hidden />
              <span className="size-3 rounded-full bg-marketing-hero-foreground-muted/40" aria-hidden />
              <span className="size-3 rounded-full bg-marketing-hero-foreground-muted/40" aria-hidden />
              <span className="ml-2 text-xs text-marketing-hero-foreground-muted">
                Chrona Demo
              </span>
            </div>
            <div className="relative aspect-video bg-marketing-hero-from">
              <iframe
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                src="https://player.vimeo.com/video/1163177906?badge=0&autopause=0&player_id=0&app_id=58479"
                title="Chrona Demo"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </motion.div>

        <motion.p
          className="mt-6 text-center text-sm text-marketing-hero-foreground-muted/80"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          Desktop app and CPAAutomation dashboard integration available now.
        </motion.p>
      </div>
    </section>
  )
}
