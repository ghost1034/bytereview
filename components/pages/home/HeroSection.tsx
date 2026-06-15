'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Check, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { MetricCard } from '@/components/marketing/metric-card'
import { fadeInUp, staggerChild, staggerContainer } from '@/lib/animations'
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

interface HeroSectionProps {
  onGetStarted: () => void
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  const heroRef = useRef<HTMLDivElement>(null)
  // Map scrolling through the hero to a 0→1 value that drives the documents→grid morph.
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <div ref={heroRef}>
      <MarketingHero
        width="narrow"
        backdrop="gradient"
        className="flex min-h-[calc(100svh-var(--header-height))] flex-col justify-center"
        background={
          <>
            <HeroPoster />
            <HeroScene progress={progress} />
            {/* Scrim keeps headline contrast over the busy 3D layer */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--marketing-hero-from)/0.35)_0%,hsl(var(--marketing-hero-from)/0.75)_70%)]"
            />
          </>
        }
        eyebrow="Built by CPAs, for professionals"
        title={
          <>
            The AI Platform for{' '}
            <span className="bg-gradient-to-r from-accent-blue-300 to-accent-blue-500 bg-clip-text text-transparent">
              Accounting, Finance &amp; Legal
            </span>{' '}
            Professionals
          </>
        }
        description="From document intelligence to AI writing, time tracking, and autonomous agents — one platform that handles your most time-consuming work."
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
                  Watch Demo
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
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="contents"
          >
            <motion.div variants={staggerChild}>
              <MetricCard
                inverted
                size="md"
                label="Accuracy rate"
                value={<CountUp target={99.2} suffix="%" decimals={1} />}
              />
            </motion.div>
            <motion.div variants={staggerChild}>
              <MetricCard
                inverted
                size="md"
                label="Time reduction"
                value={<CountUp target={95} suffix="%" />}
              />
            </motion.div>
            <motion.div variants={staggerChild}>
              <MetricCard
                inverted
                size="md"
                label="Document types"
                value={<CountUp target={100} suffix="+" />}
              />
            </motion.div>
          </motion.div>
        }
      />
    </div>
  )
}
