'use client'

import { motion } from 'framer-motion'
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const DOWNLOADS = {
  mac: 'https://github.com/ghost1034/chrona/releases/download/stable/Chrona-0.0.0-arm64.dmg',
  windows:
    'https://github.com/ghost1034/chrona/releases/download/stable/Chrona.Setup.0.0.0.exe',
}

const FEATURES = [
  {
    icon: Clock,
    label: 'Automatic Time Capture',
    detail: 'AI turns screen activity into time-aligned cards — no timers, no manual entry',
  },
  {
    icon: MonitorSmartphone,
    label: 'One-Code Device Pairing',
    detail: 'Staff redeem a pairing code and their hours sync to your firm dashboard',
  },
  {
    icon: BarChart3,
    label: 'Firm-Wide Visibility',
    detail: 'Hours by category and by day across every paired device at your firm',
  },
  {
    icon: CalendarDays,
    label: 'Daily Timelines',
    detail: "Drill into any device's day to see exactly how time was spent",
  },
  {
    icon: FileSpreadsheet,
    label: 'Billing-Ready Exports',
    detail: 'Export tracked hours to CSV for timesheets, WIP review, and client billing',
  },
  {
    icon: ShieldCheck,
    label: 'Local-First Privacy',
    detail: 'Screenshots stay on each device — only structured activity summaries sync',
  },
]

export default function ChronaShowcase() {
  return (
    <section
      id="chrona-showcase"
      className="relative isolate overflow-hidden bg-background py-24 text-foreground"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-0 size-[500px] rounded-full bg-accent-blue-500/10 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-1/4 size-[400px] rounded-full bg-accent-blue-400/10 blur-3xl"
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
              className="mb-4 rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 text-accent-blue-300"
            >
              <Clock className="mr-1.5 size-3" aria-hidden />
              Now available
            </Badge>
          </motion.div>
          <motion.h2
            className="mb-4 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
            variants={staggerChild}
          >
            Chrona: every hour,{' '}
            <span className="bg-gradient-to-r from-accent-blue-300 to-accent-blue-500 bg-clip-text text-transparent">
              accounted for
            </span>
          </motion.h2>
          <motion.p
            className="mx-auto max-w-2xl text-balance text-lg text-foreground-muted"
            variants={staggerChild}
          >
            Automatic screen-based time tracking for accounting teams. AI
            reconstructs each workday into a structured timeline that syncs
            straight into your CPAAutomation dashboard — no timers, no
            end-of-week timesheet archaeology.
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
              className="glass-card rounded-2xl p-5 transition-colors hover:border-accent-blue-400/40"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
                  aria-hidden
                >
                  <f.icon className="size-5" />
                </span>
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
          className="mx-auto max-w-4xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="glass-card overflow-hidden rounded-2xl p-3 shadow-glow">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-1.5 border-b border-border bg-surface-muted/60 px-4 py-2">
                <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
                <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
                <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
                <span className="ml-2 text-xs text-foreground-subtle">
                  Chrona Demo
                </span>
              </div>
              <div className="relative aspect-video bg-surface">
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
          </div>
        </motion.div>

        <motion.div
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Button
            asChild
            size="lg"
            className="w-full bg-accent-blue-500 px-8 text-white hover:bg-accent-blue-500/90 sm:w-auto"
          >
            <a href={DOWNLOADS.mac}>
              <Download className="mr-2 size-4" aria-hidden />
              Download for Mac
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            className="w-full bg-accent-blue-500 px-8 text-white hover:bg-accent-blue-500/90 sm:w-auto"
          >
            <a href={DOWNLOADS.windows}>
              <Download className="mr-2 size-4" aria-hidden />
              Download for Windows
            </a>
          </Button>
        </motion.div>

        <motion.div
          className="mx-auto mt-6 max-w-2xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Collapsible>
            <CollapsibleTrigger className="group mx-auto flex items-center gap-1.5 text-sm text-foreground-muted transition-colors hover:text-foreground">
              If you see that the app is &ldquo;damaged and can&rsquo;t be
              opened&rdquo;
              <ChevronDown
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="glass-card mt-4 rounded-2xl p-5 text-left text-sm text-foreground-muted">
                <ol className="list-decimal space-y-3 pl-5">
                  <li>Open Terminal</li>
                  <li>
                    Remove the quarantine flag
                    <ul className="mt-2 list-disc space-y-2 pl-5">
                      <li>
                        Type (don&rsquo;t press Enter yet):
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-accent-blue-200">
                          {'sudo xattr -dr com.apple.quarantine '}
                        </pre>
                      </li>
                      <li>
                        Drag the damaged app into the Terminal window (this
                        fills in the app&rsquo;s path).
                      </li>
                      <li>Press Enter.</li>
                    </ul>
                    <p className="mt-2">Example:</p>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-accent-blue-200">
                      sudo xattr -dr com.apple.quarantine
                      /Applications/Chrona.app
                    </pre>
                  </li>
                  <li>Launch the app again</li>
                </ol>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </motion.div>

        <motion.p
          className="mt-6 text-center text-sm text-foreground-subtle"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          Chrona desktop app and the CPAAutomation Time Tracking dashboard are
          available now.
        </motion.p>
      </div>
    </section>
  )
}
