'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  Calculator,
  CheckCircle2,
  Landmark,
  Scale,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import { accent } from '@/components/pages/home/shared/tones'
import { VideoCard } from '@/components/marketing/video-card'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const TONE = 'amber'
const a = accent(TONE)

const CAPABILITIES = [
  { title: 'Automated bank reconciliations' },
  { title: 'Contract clause extraction and review' },
  { title: 'Tax form preparation and validation' },
  { title: 'Regulatory compliance checks' },
]

const WORKERS = [
  {
    icon: Calculator,
    name: 'AccountingClaw',
    discipline: 'Accounting',
    description:
      'Closes books, reconciles ledgers, and prepares working papers with audit-ready precision.',
  },
  {
    icon: Landmark,
    name: 'FinanceClaw',
    discipline: 'Finance',
    description:
      'Builds models, validates filings, and runs variance analysis across the close cycle.',
  },
  {
    icon: Scale,
    name: 'LegalClaw',
    discipline: 'Legal',
    description:
      'Drafts, reviews, and analyzes legal work product with 1,251 skills across 24 practice areas.',
  },
]

const VIDEOS = [
  {
    src: 'https://www.youtube-nocookie.com/embed/976yIJsO1cA?si=82I14R9fUPznZX1E',
    title: 'AccountingClaw Preview',
  },
  {
    src: 'https://www.youtube-nocookie.com/embed/hePBTs8MnFQ?si=exJDcDO07KvjXkb4',
    title: 'Dual Agent Technical Accounting Memo',
  },
  {
    src: 'https://www.youtube-nocookie.com/embed/939uCq5jxN0?si=77c9Gr7DVJiHKlnx',
    title: 'AI Skill for Browser Automation',
  },
]

export default function ClawShowcase() {
  return (
    <SectionShell
      id="claw-showcase"
      surface="transparent"
      eyebrow="Claw Series"
      eyebrowIcon={Bot}
      eyebrowTone={TONE}
      title={
        <>
          Claw Series:{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            digital workers
          </span>{' '}
          for accounting, finance &amp; legal
        </>
      }
      description="AccountingClaw, FinanceClaw, and LegalClaw are AI agents that work autonomously — not just tools you operate, but digital workers you deploy. Hundreds of pre-built skills with guardrails designed for regulated environments."
      background={
        /* Decorative glow orbs. The parent <section> is `relative isolate`,
           so these sit behind the content. */
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[120px] animate-glow-pulse"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-[-10%] size-[420px] rounded-full bg-amber-400/10 blur-[120px]"
          />
        </>
      }
    >
      {/* Digital-worker cards */}
      <motion.div
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {WORKERS.map((worker) => (
          <motion.div key={worker.name} variants={staggerChild}>
            <GlassCard
              className={cn('h-full p-8 transition-colors', a.hoverBorder)}
            >
              <span
                className={cn(
                  'mb-6 inline-flex size-14 items-center justify-center rounded-2xl shadow-glow',
                  a.chip,
                )}
              >
                <worker.icon className="size-7" aria-hidden />
              </span>
              <p className={cn('text-xs font-medium uppercase tracking-wider', a.text)}>
                {worker.discipline}
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                {worker.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                {worker.description}
              </p>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>

      {/* Capabilities chip row */}
      <motion.ul
        className="mt-8 flex flex-wrap justify-center gap-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {CAPABILITIES.map((capability) => (
          <motion.li
            key={capability.title}
            variants={staggerChild}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-4 py-2 text-sm text-foreground-muted backdrop-blur-sm"
          >
            <CheckCircle2 className={cn('size-4 shrink-0', a.text)} aria-hidden />
            {capability.title}
          </motion.li>
        ))}
      </motion.ul>

      {/* Video showcase */}
      <motion.div
        className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {VIDEOS.map((video) => (
          <motion.div key={video.src} variants={staggerChild}>
            <VideoCard src={video.src} title={video.title} />
          </motion.div>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.div
        className="mt-12 text-center"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <Link
          href="/claw"
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-6 py-3 text-base font-medium transition-colors hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            a.pill,
          )}
        >
          Learn more about Claw Series
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </motion.div>
    </SectionShell>
  )
}
