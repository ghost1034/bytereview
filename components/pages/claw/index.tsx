'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  Briefcase,
  Calculator,
  Cloud,
  Scale,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import { Section } from '@/components/ui/section'
import { CTABanner } from '@/components/marketing/cta-banner'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { ShowcaseSection } from '@/components/marketing/showcase-section'
import { VideoCard } from '@/components/marketing/video-card'
import {
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const CAPABILITIES = [
  { title: 'Automated bank reconciliations' },
  { title: 'Contract clause extraction and review' },
  { title: 'Tax form preparation and validation' },
  { title: 'Regulatory compliance checks' },
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

const CLOUD_OPTIONS = [
  'Amazon Web Services (AWS)',
  'Google Cloud Platform (GCP)',
  'Microsoft Azure',
  'Self-hosted in your VPC',
]

const MODEL_OPTIONS = [
  'Anthropic Claude',
  'OpenAI GPT',
  'Google Gemini',
  'Open-source (Llama, Mistral)',
]

const SKILL_PACKAGES: Array<{
  icon: React.ComponentType<{ className?: string }>
  name: string
  detail: string
}> = [
  {
    icon: Calculator,
    name: 'AccountingClaw',
    detail: 'Bank reconciliations, journal entries, month-end close',
  },
  {
    icon: Briefcase,
    name: 'FinanceClaw',
    detail: 'FP&A automations, flux analysis, reporting packs',
  },
  {
    icon: Scale,
    name: 'LegalClaw',
    detail: 'Contract clause review, redlines, compliance checks',
  },
]

function VideoStack() {
  return (
    <motion.div
      className="space-y-6"
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
  )
}

export default function Claw() {
  return (
    <>
      <MarketingHero
        backdrop="gradient"
        width="wide"
        eyebrow={
          <>
            <Bot className="size-3.5" aria-hidden />
            Now available · personalized setup
          </>
        }
        title={
          <>
            Claw Series — digital workers, deployed{' '}
            <span className="bg-gradient-to-r from-marketing-hero-accent to-marketing-hero-foreground bg-clip-text text-transparent">
              your way
            </span>
          </>
        }
        description="AccountingClaw, FinanceClaw, and LegalClaw run hundreds of pre-built skills autonomously, with guardrails built for accounting, finance, and legal workflows. Choose the cloud, model, and skills — or let us configure everything for you."
        ctas={
          <>
            <Button asChild size="lg">
              <Link href="/contact">
                Contact us to get started
                <ArrowRight className="ml-1.5 size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#setup-options">See setup options</a>
            </Button>
          </>
        }
      />

      <ShowcaseSection
        surface="background"
        eyebrow={
          <Badge
            variant="outline"
            className="rounded-full border-primary/20 bg-primary-soft text-primary-soft-foreground"
          >
            <Bot className="mr-1.5 size-3" aria-hidden />
            Claw Series
          </Badge>
        }
        title={
          <>
            Autonomous{' '}
            <span className="bg-gradient-to-r from-primary to-marketing-hero-accent bg-clip-text text-transparent">
              digital workers
            </span>{' '}
            for accounting, finance &amp; legal
          </>
        }
        description="Not just tools you operate — digital workers you deploy. Each Claw runs hundreds of pre-built skills end-to-end, with guardrails designed for regulated environments."
        features={CAPABILITIES}
        media={<VideoStack />}
      />

      <section id="setup-options" className="bg-surface-muted py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              Personalized setup
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Choose your stack, or let us choose it for you
            </h2>
            <p className="mt-4 text-balance text-base text-foreground-muted">
              Tell us your preferences and we'll deploy AccountingClaw,
              FinanceClaw, and LegalClaw on the infrastructure and models you
              already trust.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Section variant="card">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconTile icon={Cloud} tone="brand" size="lg" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Cloud provider
                  </h3>
                </div>
                <p className="text-sm text-foreground-muted">
                  Run Claw on the cloud you already use, or keep everything
                  inside your own VPC.
                </p>
                <ul className="space-y-2">
                  {CLOUD_OPTIONS.map((option) => (
                    <li
                      key={option}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                      {option}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            <Section variant="card">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconTile icon={BrainCircuit} tone="brand" size="lg" />
                  <h3 className="text-lg font-semibold text-foreground">
                    AI model
                  </h3>
                </div>
                <p className="text-sm text-foreground-muted">
                  Pick the foundation model that fits your accuracy, latency,
                  and data-residency requirements.
                </p>
                <ul className="space-y-2">
                  {MODEL_OPTIONS.map((option) => (
                    <li
                      key={option}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                      {option}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            <Section variant="card">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <IconTile icon={Bot} tone="brand" size="lg" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Skill packages
                  </h3>
                </div>
                <p className="text-sm text-foreground-muted">
                  Deploy one Claw or all three. Each comes with hundreds of
                  domain-specific skills out of the box.
                </p>
                <ul className="space-y-3">
                  {SKILL_PACKAGES.map((pkg) => {
                    const Icon = pkg.icon
                    return (
                      <li
                        key={pkg.name}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Icon
                          className="mt-0.5 size-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            {pkg.name}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {pkg.detail}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </Section>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-foreground-muted">
            Don't see your preferred provider or model? Tell us in your
            message — we can usually accommodate.
          </p>
        </div>
      </section>

      <section className="bg-background pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Section
            variant="card"
            className="bg-surface-muted"
            title={
              <span className="inline-flex items-center gap-2 text-xl">
                <IconTile icon={BookOpen} tone="brand" size="md" />
                Prefer white-glove setup?
              </span>
            }
            description="We'll pick the cloud, model, and skill mix based on your firm's size, compliance needs, and budget — then deploy, train your team, and stay on for ongoing tuning."
          >
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/contact">Talk to our team</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/demo">View demo videos</Link>
              </Button>
            </div>
          </Section>
        </div>
      </section>

      <CTABanner
        tone="gradient"
        eyebrow="Ready when you are"
        title="Deploy your first Claw in days, not months"
        description="Reach out and we'll scope a setup tailored to your firm — including pricing, security review, and a deployment timeline."
        primary={
          <Button asChild size="lg" variant="secondary">
            <Link href="/contact">Contact us</Link>
          </Button>
        }
        secondary={
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">View pricing</Link>
          </Button>
        }
      />
    </>
  )
}
