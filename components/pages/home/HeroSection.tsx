'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { Check, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { MetricCard } from '@/components/marketing/metric-card'
import { fadeInUp, staggerChild, staggerContainer } from '@/lib/animations'

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
  return (
    <MarketingHero
      width="narrow"
      backdrop="gradient"
      eyebrow="Built by CPAs, for professionals"
      title={
        <>
          The AI Platform for{' '}
          <span className="bg-gradient-to-r from-marketing-hero-accent to-primary-soft bg-clip-text text-transparent">
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
              className="btn-shimmer w-full bg-marketing-hero-foreground px-8 text-marketing-hero-from hover:bg-marketing-hero-foreground/90 sm:w-auto"
            >
              Get Started Free →
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full border border-marketing-hero-border bg-transparent px-8 text-marketing-hero-foreground hover:bg-marketing-hero-foreground/10 hover:text-marketing-hero-foreground sm:w-auto">
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
          className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3"
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
  )
}
