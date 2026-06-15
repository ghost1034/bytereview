'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FlowLinesAccent } from '@/components/pages/home/three/FlowLinesAccent'
import {
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

interface CTABannerProps {
  onGetStarted: () => void
}

export default function CTABanner({ onGetStarted }: CTABannerProps) {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="relative overflow-hidden rounded-2xl border border-border-strong bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to px-6 py-16 text-center text-marketing-hero-foreground shadow-glow sm:px-12 sm:py-20"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {/* Ambient auto-looping data-flow particles behind the CTA */}
          <FlowLinesAccent className="opacity-60" />
          <span
            aria-hidden
            className="pointer-events-none absolute -top-32 right-0 size-[420px] rounded-full bg-accent-blue-500/20 blur-3xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-40 left-0 size-[320px] rounded-full bg-accent-blue-400/15 blur-3xl"
          />

          <div className="relative mx-auto max-w-3xl space-y-6">
            <motion.h2
              className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
              variants={staggerChild}
            >
              Ready to transform your workflow?
            </motion.h2>
            <motion.p
              className="mx-auto max-w-2xl text-balance text-lg text-marketing-hero-foreground-muted"
              variants={staggerChild}
            >
              Join accounting firms, legal teams, and investment funds already
              saving hundreds of hours with CPAAutomation.
            </motion.p>

            <motion.div
              className="flex flex-col items-center justify-center gap-3 sm:flex-row"
              variants={staggerChild}
            >
              <Button
                onClick={onGetStarted}
                size="lg"
                className="btn-shimmer w-full bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600 sm:w-auto"
              >
                Get started free
                <ArrowRight className="ml-2 size-5" aria-hidden />
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="w-full border border-marketing-hero-border bg-transparent px-8 text-marketing-hero-foreground hover:bg-marketing-hero-foreground/10 hover:text-marketing-hero-foreground sm:w-auto"
              >
                <Link href="/demo">See a demo</Link>
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
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-accent-blue-400" aria-hidden />
                Setup in under 10 minutes
              </span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
