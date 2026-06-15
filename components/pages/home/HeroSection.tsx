'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Check, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { fadeInUp } from '@/lib/animations'
import { HeroPoster } from './three/HeroPoster'

// The WebGL scene is client-only and code-split so it never blocks first paint or SSR.
const HeroScene = dynamic(() => import('./three/HeroScene'), { ssr: false })

function CountUp({
  target,
  suffix = '',
  decimals = 0,
}: {
  target: number
  suffix?: string
  decimals?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [value, setValue] = useState(0)

  const animate = useCallback(() => {
    const duration = 2000
    const start = performance.now()
    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(eased * target)
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target])

  useEffect(() => {
    if (inView) animate()
  }, [inView, animate])

  return (
    <span ref={ref}>
      {decimals > 0 ? value.toFixed(decimals) : Math.round(value)}
      {suffix}
    </span>
  )
}

/** A single ledger-style metric: a mono, tabular numeral paired with a quiet label. */
function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-marketing-hero-foreground sm:text-3xl">
        {value}
      </span>
      <span className="text-xs uppercase tracking-wider text-marketing-hero-foreground-muted">
        {label}
      </span>
    </span>
  )
}

interface HeroSectionProps {
  onGetStarted: () => void
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  return (
    <MarketingHero
      width="narrow"
      backdrop="gradient"
      statsLayout="plain"
      className="flex min-h-[calc(100svh-var(--header-height))] flex-col justify-center"
      titleClassName="text-balance text-5xl tracking-tighter sm:text-6xl lg:text-7xl"
      background={
        <>
          <HeroPoster />
          <HeroScene />
          {/* Scrim keeps headline contrast over the drifting documents */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--marketing-hero-from)/0.45)_0%,hsl(var(--marketing-hero-from)/0.8)_70%)]"
          />
          {/* Feather the hero into the page wash so it dissolves rather than
              stopping at a hard seam against the first section below */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[hsl(222_43%_11%)]"
          />
        </>
      }
      eyebrow={
        <span className="font-mono tracking-[0.2em]">
          Built by CPAs, for professionals
        </span>
      }
      title={
        <>
          Less busywork.{' '}
          <span className="bg-gradient-to-r from-accent-blue-300 to-accent-blue-500 bg-clip-text text-transparent">
            More billable hours.
          </span>
        </>
      }
      description="One platform for document intelligence, AI writing, time tracking, and autonomous agents — built for accounting, finance, and legal teams."
      ctas={
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex w-full flex-col items-center justify-center gap-4"
        >
          <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              onClick={onGetStarted}
              size="lg"
              className="btn-shimmer w-full bg-accent-blue-500 px-8 text-white hover:bg-accent-blue-600 sm:w-auto"
            >
              Get started free
              <ArrowRight className="ml-2 size-5" aria-hidden />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="w-full border border-marketing-hero-border bg-white/5 px-8 text-marketing-hero-foreground backdrop-blur-sm hover:bg-white/10 hover:text-marketing-hero-foreground sm:w-auto"
            >
              <Link href="/demo">
                <Play className="mr-2 size-4" aria-hidden />
                Watch demo
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-marketing-hero-foreground-muted">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-success" aria-hidden />
              No credit card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-success" aria-hidden />
              100 free pages/month
            </span>
          </div>
        </motion.div>
      }
      stats={
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-7"
        >
          <Stat value={<CountUp target={99.2} suffix="%" decimals={1} />} label="accuracy" />
          <span aria-hidden className="hidden h-7 w-px bg-marketing-hero-border sm:block" />
          <Stat value={<CountUp target={95} suffix="%" />} label="faster" />
          <span aria-hidden className="hidden h-7 w-px bg-marketing-hero-border sm:block" />
          <Stat value={<CountUp target={100} suffix="+" />} label="doc types" />
        </motion.div>
      }
    />
  )
}
