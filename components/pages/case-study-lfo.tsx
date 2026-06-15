'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Building2,
  Clock,
  DollarSign,
  Quote,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { accent, type Accent } from '@/components/pages/home/shared/tones'
import {
  fadeInUp,
  scaleIn,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const METRICS: {
  icon: React.ComponentType<{ className?: string }>
  tone: Accent
  label: string
  value: string
  sublabel?: string
}[] = [
  { icon: Clock, tone: 'blue', label: 'Hours saved annually', value: '200+' },
  {
    icon: Users,
    tone: 'emerald',
    label: 'Portfolio companies',
    value: '100+',
    sublabel: 'Processed quarterly',
  },
  { icon: TrendingUp, tone: 'sky', label: 'Time reduction', value: '95%' },
  { icon: DollarSign, tone: 'amber', label: 'Annual savings', value: '$100K+' },
]

const FIRM_FACTS = [
  { title: 'ESG & technology-focused family office' },
  { title: '100+ portfolio companies' },
  { title: 'Quarterly reporting cycles' },
  { title: '15+ investment professionals' },
]

const PAIN_POINTS = [
  'Manual extraction of financial metrics from 100+ portfolio companies quarterly',
  'Inconsistent document formats from different companies',
  'Time-sensitive quarterly reporting deadlines',
  'Risk of human error in data transcription',
  'Limited scalability for growing portfolio',
]

const IMPLEMENTATION = [
  { title: 'Custom extraction templates for revenue, equity, and valuation metrics' },
  { title: 'Automated classification of valuation types' },
  { title: 'Recognition of different foreign currencies used in statements' },
  { title: 'Quality assurance workflows for data validation' },
]

const TIME_SAVINGS = [
  'Quarterly processing reduced from 3 days to 2 hours',
  'Individual report processing: 30 min → 5 sec',
  '95% reduction in manual data entry',
  'Freed up 200+ hours annually',
]

const QUALITY = [
  '99.8% accuracy in data extraction',
  'Eliminated transcription errors',
  'Standardized data formats across portfolio',
  'Real-time validation and error detection',
]

export default function CaseStudyLFO() {
  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="narrow"
        eyebrow={
          <Link
            href="/"
            className="inline-flex items-center text-marketing-hero-foreground-muted hover:text-marketing-hero-foreground"
          >
            <ArrowLeft className="mr-1.5 size-3.5" aria-hidden />
            Back to home
          </Link>
        }
        title={
          <>
            Leonardo Family Office{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              case study
            </span>
          </>
        }
        description="How a leading family office firm automated investment statement processing and saved hundreds of hours annually."
      />

      {/* Metrics */}
      <SectionShell surface="surface">
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {METRICS.map((m) => {
            const Icon = m.icon
            const a = accent(m.tone)
            return (
              <motion.div key={m.label} variants={staggerChild}>
                <GlassCard className="h-full p-6">
                  <span
                    aria-hidden
                    className={cn(
                      'mb-4 inline-flex size-11 items-center justify-center rounded-xl',
                      a.chip,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="text-3xl font-semibold text-foreground">
                    {m.value}
                  </div>
                  <div className="mt-1 text-sm text-foreground-muted">
                    {m.label}
                  </div>
                  {m.sublabel && (
                    <div className="text-xs text-foreground-subtle">
                      {m.sublabel}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )
          })}
        </motion.div>
      </SectionShell>

      {/* About LFO */}
      <SectionShell
        surface="background"
        eyebrow="The firm"
        eyebrowIcon={Building2}
        eyebrowTone="blue"
        title="About Leonardo Family Office"
        description="Leonardo Family Office (LFO) is a leading ESG and technology-focused family office management firm."
        media={
          <motion.div
            variants={scaleIn}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="relative"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-4 rounded-3xl bg-accent-blue-500/15 blur-2xl"
            />
            <div className="relative overflow-hidden rounded-2xl shadow-glow ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-4.0.3&w=600&h=400&fit=crop"
                alt="Investment team meeting"
                className="h-auto w-full"
                loading="lazy"
              />
            </div>
          </motion.div>
        }
      >
        <FeatureList items={FIRM_FACTS} tone="blue" className="pt-1" />
      </SectionShell>

      {/* The challenge */}
      <SectionShell
        surface="surface"
        width="narrow"
        eyebrow="The challenge"
        eyebrowIcon={Clock}
        eyebrowTone="amber"
        title="The challenge"
        description="LFO's investment team was spending an overwhelming amount of time manually processing quarterly financial statements from their portfolio companies."
      >
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <GlassCard className="p-6 sm:p-8">
            <h3 className="mb-4 text-lg font-semibold text-foreground">
              Key pain points
            </h3>
            <ul className="space-y-4">
              {PAIN_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span
                    className="mt-2 size-2 shrink-0 rounded-full bg-destructive"
                    aria-hidden
                  />
                  <p className="text-foreground-muted">{point}</p>
                </li>
              ))}
            </ul>
          </GlassCard>
        </motion.div>
      </SectionShell>

      {/* The solution */}
      <SectionShell
        surface="background"
        reverse
        eyebrow="The solution"
        eyebrowIcon={Wrench}
        eyebrowTone="emerald"
        title="The solution"
        description="Leonardo Family Office implemented our PDF extraction platform to automate their quarterly reporting workflow — with custom extraction templates for financial metrics and automated data validation."
        media={
          <motion.div
            variants={scaleIn}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <BrowserFrame label="Extraction results">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&w=600&h=400&fit=crop"
                alt="Data extraction dashboard"
                className="h-auto w-full"
                loading="lazy"
              />
            </BrowserFrame>
          </motion.div>
        }
      >
        <div className="space-y-4 pt-1">
          <h3 className="text-lg font-semibold text-foreground">
            Implementation features
          </h3>
          <FeatureList items={IMPLEMENTATION} tone="emerald" />
        </div>
      </SectionShell>

      {/* Results & impact */}
      <SectionShell
        surface="surface"
        eyebrow="Results & impact"
        eyebrowIcon={TrendingUp}
        eyebrowTone="violet"
        title="Results & impact"
      >
        <motion.div
          className="space-y-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <GlassCard glow className="p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <Quote
                  className={cn('size-7', accent('violet').text)}
                  aria-hidden
                />
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn('size-4 fill-amber-300', accent('amber').text)}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
              <p className="text-lg text-foreground-muted">
                Our team used to spend weeks manually extracting financial data
                from portfolio reports. Now we process quarterly statements from
                100+ companies in just minutes with perfect accuracy. This
                transformation has allowed our investment professionals to focus
                on what they do best: identifying opportunities and supporting
                our portfolio companies.
              </p>
              <div className="mt-6 border-t border-border pt-4">
                <p className="font-semibold text-foreground">C**** Leonardo</p>
                <p className="text-sm text-foreground-subtle">
                  CFO · Leonardo Family Office
                </p>
              </div>
            </GlassCard>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <motion.div variants={staggerChild}>
              <GlassCard className="h-full p-6">
                <h3 className="mb-4 text-lg font-semibold text-foreground">
                  Time savings
                </h3>
                <ul className="space-y-2 text-foreground-muted">
                  {TIME_SAVINGS.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </GlassCard>
            </motion.div>
            <motion.div variants={staggerChild}>
              <GlassCard className="h-full p-6">
                <h3 className="mb-4 text-lg font-semibold text-foreground">
                  Quality improvements
                </h3>
                <ul className="space-y-2 text-foreground-muted">
                  {QUALITY.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </GlassCard>
            </motion.div>
          </div>
        </motion.div>
      </SectionShell>

      {/* CTA */}
      <SectionShell
        surface="background"
        width="narrow"
        eyebrow="Get started"
        eyebrowIcon={Sparkles}
        eyebrowTone="blue"
        title="Ready to transform your document processing?"
        description="See how our PDF extraction platform can help your organization save time and improve accuracy."
        background={
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 size-[420px] -translate-x-1/2 rounded-full bg-accent-blue-500/15 blur-3xl"
          />
        }
      >
        <motion.div
          className="flex justify-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Button
            asChild
            size="lg"
            className="btn-shimmer bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600"
          >
            <Link href="/demo">Try it now</Link>
          </Button>
        </motion.div>
      </SectionShell>
    </div>
  )
}
