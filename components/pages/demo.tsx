'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { VideoCard } from '@/components/marketing/video-card'
import AuthModal from '@/components/auth/AuthModal'
import {
  fadeInUp,
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
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        eyebrow="Demo"
        title="See CPAAutomation in action"
        description="Watch how our products work in real-world accounting, finance, and legal workflows."
      />

      <section className="bg-surface-muted py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-10 text-center"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <Badge
              variant="secondary"
              className="mb-3 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
            >
              Document Analysis
            </Badge>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              AI extraction, analysis, and automations
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {ANALYSIS_VIDEOS.map((v) => (
              <motion.div key={v.title} variants={staggerChild}>
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
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-10 text-center"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <Badge
              variant="outline"
              className="mb-3 rounded-full border-success/20 bg-success-soft text-success"
            >
              Products to come
            </Badge>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              What we&apos;re building next
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-foreground-muted">
              Preview the next generation of tools coming to the CPAAutomation
              platform.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 gap-6 md:grid-cols-2"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {UPCOMING_VIDEOS.map((v) => (
              <motion.div key={v.title} variants={staggerChild}>
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
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to px-6 py-16 text-center text-marketing-hero-foreground shadow-md sm:px-12"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-32 right-0 size-[420px] rounded-full bg-marketing-hero-accent/15 blur-3xl"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-40 left-0 size-[320px] rounded-full bg-marketing-hero-accent/10 blur-3xl"
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
                  className="btn-shimmer bg-marketing-hero-foreground px-8 font-semibold text-marketing-hero-from hover:bg-marketing-hero-foreground/90"
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
                  <Check className="size-4 text-success" aria-hidden />
                  No credit card required
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-success" aria-hidden />
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
    </>
  )
}
