'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, FileText, PenTool, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { VideoCard } from '@/components/marketing/video-card'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent } from '@/components/pages/home/shared/tones'
import AuthModal from '@/components/auth/AuthModal'
import {
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const ANALYSIS_VIDEOS = [
  {
    title: 'Build P&L in 2 Minutes',
    src: 'https://www.youtube-nocookie.com/embed/tNwpajJZ8zA?si=y6cb2ZD7I42YRXND',
  },
  {
    title: 'Free CPE Tracker',
    src: 'https://www.youtube-nocookie.com/embed/gchB4SbxsJM?si=KlJMFOjH0nKP08yX',
  },
  {
    title: 'Bank Statement Analysis',
    src: 'https://www.youtube-nocookie.com/embed/mxDEliIRWtc?si=brPvZMmN0F5Tbeeh',
  },
  {
    title: 'Invoice Extraction and Contract Review',
    src: 'https://www.youtube-nocookie.com/embed/uWA5ds9VuPM?si=DxjCBqrxZ997eF5A',
  },
  {
    title: 'Email and Google Drive Automations',
    src: 'https://www.youtube-nocookie.com/embed/R0ubnn4ggGA?si=XZ6cP69kg5JqebIT',
  },
]

const WRITING_VIDEOS = [
  {
    title: 'Write a Professional Investor Report in Minutes with AI',
    src: 'https://www.youtube-nocookie.com/embed/OaloCO7Bh28?si=sx0_nt3OfuYFJL5u',
  },
  {
    title: 'Write a Legal Complaint Faster with AI',
    src: 'https://www.youtube-nocookie.com/embed/pNpDUlNZuuU?si=AHTVSvVUEriqK6db',
  },
  {
    title: 'Write a Robust Academic Article with 70+ References Using AI',
    src: 'https://www.youtube-nocookie.com/embed/qmFBxibcals?si=-Sq1Lr-AgZDPg5pC',
  },
]

const UPCOMING_VIDEOS = [
  {
    title: 'AccountingClaw Preview',
    src: 'https://www.youtube-nocookie.com/embed/976yIJsO1cA?si=82I14R9fUPznZX1E',
    description:
      'AI digital workers that perform accounting tasks autonomously.',
  },
  {
    title: 'Dual Agent Technical Accounting Memo',
    src: 'https://www.youtube-nocookie.com/embed/hePBTs8MnFQ?si=exJDcDO07KvjXkb4',
    description:
      'Two AI agents collaborate to solve a technical accounting problem through structured reasoning.',
  },
  {
    title: 'AI Skill for Browser Automation',
    src: 'https://www.youtube-nocookie.com/embed/939uCq5jxN0?si=77c9Gr7DVJiHKlnx',
    description:
      'Automatically download a NetSuite report with SOX- and audit-compliant screenshots.',
  },
]

export default function Demo() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="narrow"
        eyebrow="Demo"
        title={
          <>
            See CPAAutomation{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              in action
            </span>
          </>
        }
        description="Watch how our products work in real-world accounting, finance, and legal workflows."
      />

      {/* Document analysis videos */}
      <SectionShell
        surface="surface"
        eyebrow="Document analysis"
        eyebrowIcon={FileText}
        eyebrowTone="blue"
        title="AI extraction, analysis, and automations"
      >
        <motion.div
          className="flex flex-wrap justify-center gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {ANALYSIS_VIDEOS.map((v) => (
            <motion.div
              key={v.title}
              variants={staggerChild}
              className="w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
            >
              <VideoCard
                src={v.src}
                title={v.title}
                description={
                  <span className="text-center font-semibold text-foreground">
                    {v.title}
                  </span>
                }
              />
            </motion.div>
          ))}
        </motion.div>
      </SectionShell>

      {/* AI writing videos */}
      <SectionShell
        surface="background"
        eyebrow="AI writing"
        eyebrowIcon={PenTool}
        eyebrowTone="violet"
        title="Draft polished documents with Inkwise"
      >
        <motion.div
          className="flex flex-wrap justify-center gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {WRITING_VIDEOS.map((v) => (
            <motion.div
              key={v.title}
              variants={staggerChild}
              className="w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
            >
              <VideoCard
                src={v.src}
                title={v.title}
                description={
                  <span className="text-center font-semibold text-foreground">
                    {v.title}
                  </span>
                }
              />
            </motion.div>
          ))}
        </motion.div>
      </SectionShell>

      {/* Upcoming products */}
      <SectionShell
        surface="surface"
        eyebrow="Products to come"
        eyebrowIcon={Sparkles}
        eyebrowTone="emerald"
        title="What we're building next"
        description="Preview the next generation of tools coming to the CPAAutomation platform."
      >
        <motion.div
          className="flex flex-wrap justify-center gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {UPCOMING_VIDEOS.map((v) => (
            <motion.div
              key={v.title}
              variants={staggerChild}
              className="w-full md:w-[calc(50%-0.75rem)]"
            >
              <VideoCard
                src={v.src}
                title={v.title}
                description={
                  <>
                    <span className="block font-semibold text-foreground">
                      {v.title}
                    </span>
                    <span className="mt-1 block text-foreground-muted">
                      {v.description}
                    </span>
                  </>
                }
              />
            </motion.div>
          ))}
        </motion.div>
      </SectionShell>

      {/* CTA */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="relative overflow-hidden rounded-2xl border border-border-strong bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to px-6 py-16 text-center text-marketing-hero-foreground shadow-glow sm:px-12"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-32 right-0 size-[420px] rounded-full bg-accent-blue-500/20 blur-3xl"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-40 left-0 size-[320px] rounded-full bg-accent-blue-400/15 blur-3xl"
            />

            <div className="relative mx-auto max-w-3xl space-y-5">
              <motion.h2
                className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
                variants={staggerChild}
              >
                Try CPAAutomation yourself
              </motion.h2>
              <motion.p
                className="mx-auto max-w-2xl text-balance text-lg text-marketing-hero-foreground-muted"
                variants={staggerChild}
              >
                Create a free account to upload documents, connect Gmail or
                Google Drive, run automations, and see results in your
                dashboard.
              </motion.p>
              <motion.div variants={staggerChild}>
                <Button
                  onClick={() => setIsAuthModalOpen(true)}
                  size="lg"
                  className="btn-shimmer bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600"
                >
                  Sign up for free
                  <ArrowRight className="ml-2 size-5" aria-hidden />
                </Button>
              </motion.div>
              <motion.div
                className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-marketing-hero-foreground-muted"
                variants={staggerChild}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-accent-blue-400" aria-hidden />
                  No credit card required
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-accent-blue-400" aria-hidden />
                  100 free pages/month
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultTab="signup"
      />
    </div>
  )
}
