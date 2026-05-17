'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BrainCircuit,
  Briefcase,
  Code2,
  Compass,
  Handshake,
  LineChart,
  Rocket,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import { Section } from '@/components/ui/section'
import { CTABanner } from '@/components/marketing/cta-banner'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { ShowcaseSection } from '@/components/marketing/showcase-section'
import {
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const DIFFERENTIATORS = [
  {
    icon: Users,
    title: 'Embedded with your team',
    description:
      'We sit alongside your engineers, accountants, and operators — not at arm\'s length over a statement of work.',
  },
  {
    icon: Rocket,
    title: 'Working software, not slide decks',
    description:
      'Every engagement ships running code into your environment. Prototypes in weeks, production in months.',
  },
  {
    icon: Handshake,
    title: 'We own outcomes, not hours',
    description:
      'Success means the tool gets used and the business metric moves. We scope and price around that, not a billable timesheet.',
  },
  {
    icon: Compass,
    title: 'Direct line to founders',
    description:
      'You work with the people who built CPAAutomation. No layers, no handoffs, no rotating account managers.',
  },
]

const STRENGTH_PILLARS: Array<{
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  bullets: string[]
}> = [
  {
    icon: Code2,
    title: 'Strong technical skills',
    description:
      'Senior engineers who have shipped AI in production — not researchers, not generalist consultants.',
    bullets: [
      'Full-stack engineering across web, data, and infra',
      'LLM tool-use, agent design, and evaluation harnesses',
      'Cloud-native builds on AWS, GCP, and Azure',
      'Security, observability, and cost engineering built in',
    ],
  },
  {
    icon: LineChart,
    title: 'Strong business skills',
    description:
      'CPAs and operators on the team — we speak the language of the work, not just the language of the code.',
    bullets: [
      'Deep domain knowledge in accounting, finance, and legal',
      'ROI framing and stakeholder alignment',
      'Change management and team enablement',
      'Audit, compliance, and data-residency expertise',
    ],
  },
  {
    icon: Wrench,
    title: 'What we build',
    description:
      'Bespoke AI tools tailored to your workflows — not a repackaged product or a one-size-fits-all template.',
    bullets: [
      'Custom AI workflows and document pipelines',
      'Internal copilots wired into your systems',
      'Agent integrations with ERPs, DMSs, and CRMs',
      'Evaluation suites and human-in-the-loop tooling',
    ],
  },
]

const ENGAGEMENT_STEPS: Array<{
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}> = [
  {
    icon: Compass,
    title: '1 · Scope',
    description:
      'A short discovery sprint to map your workflows, data, and constraints. You leave with a written plan and a fixed-scope proposal.',
  },
  {
    icon: Sparkles,
    title: '2 · Prototype',
    description:
      'A working prototype in your environment within weeks — not a slide deck. Real data, real users, real feedback.',
  },
  {
    icon: Rocket,
    title: '3 · Deploy',
    description:
      'We harden the prototype, integrate it into your systems, and roll it out with training for the team that will use it.',
  },
  {
    icon: Handshake,
    title: '4 · Iterate',
    description:
      'Optional ongoing partnership — we tune models, ship improvements, and keep the tool sharp as your business evolves.',
  },
]

function DifferentiatorStack() {
  return (
    <motion.div
      className="space-y-4"
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      {DIFFERENTIATORS.map((item) => (
        <motion.div key={item.title} variants={staggerChild}>
          <Section variant="card">
            <div className="flex items-start gap-4">
              <IconTile icon={item.icon} tone="brand" size="md" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="text-sm text-foreground-muted">
                  {item.description}
                </p>
              </div>
            </div>
          </Section>
        </motion.div>
      ))}
    </motion.div>
  )
}

export default function Consulting() {
  return (
    <>
      <MarketingHero
        backdrop="gradient"
        width="wide"
        eyebrow={
          <>
            <Briefcase className="size-3.5" aria-hidden />
            Forward-Deployed Consulting
          </>
        }
        title={
          <>
            Strong engineers. Strong operators.{' '}
            <span className="bg-gradient-to-r from-marketing-hero-accent to-marketing-hero-foreground bg-clip-text text-transparent">
              AI tools built for your business.
            </span>
          </>
        }
        description="Our platform is one way to work with us. Forward-Deployed Consulting is the other — a senior team that embeds with yours to design, build, and ship custom AI tools end-to-end. Combining strong technical skills with deep business expertise, we turn AI ambition into software your team actually uses."
        ctas={
          <>
            <Button
              asChild
              size="lg"
              className="btn-shimmer w-full bg-marketing-hero-foreground px-8 text-marketing-hero-from hover:bg-marketing-hero-foreground/90 sm:w-auto"
            >
              <Link href="/contact">
                Start a conversation
                <ArrowRight className="ml-2 size-5" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="w-full border border-marketing-hero-border bg-transparent px-8 text-marketing-hero-foreground hover:bg-marketing-hero-foreground/10 hover:text-marketing-hero-foreground sm:w-auto"
            >
              <a href="#what-we-bring">What we bring</a>
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
            <Briefcase className="mr-1.5 size-3" aria-hidden />
            Why forward-deployed?
          </Badge>
        }
        title={
          <>
            Engineers who{' '}
            <span className="bg-gradient-to-r from-primary to-marketing-hero-accent bg-clip-text text-transparent">
              sit with your team
            </span>
            , ship working tools, and care about business outcomes
          </>
        }
        description="Most AI consulting hands you a strategy deck. We hand you software running in your environment. The difference is who shows up — senior people who understand both the code and the business it serves."
        media={<DifferentiatorStack />}
      />

      <section
        id="what-we-bring"
        className="bg-surface-muted py-16 sm:py-20 lg:py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              What we bring
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Technical depth meets business fluency
            </h2>
            <p className="mt-4 text-balance text-base text-foreground-muted">
              Two skill sets, on the same team. That&apos;s what makes an AI
              build ship — and what makes it keep working after we leave.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {STRENGTH_PILLARS.map((pillar) => (
              <Section key={pillar.title} variant="card">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <IconTile icon={pillar.icon} tone="brand" size="lg" />
                    <h3 className="text-lg font-semibold text-foreground">
                      {pillar.title}
                    </h3>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    {pillar.description}
                  </p>
                  <ul className="space-y-2">
                    {pillar.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-foreground-muted">
            Have a build in mind that spans more than one of these?
            That&apos;s usually the point — talk to us about scoping it
            together.
          </p>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              How we engage
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              From first conversation to shipped software
            </h2>
            <p className="mt-4 text-balance text-base text-foreground-muted">
              A predictable four-step shape — scoped tight at the start, with
              the option to keep going once the tool is in production.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {ENGAGEMENT_STEPS.map((step) => (
              <Section key={step.title} variant="card">
                <div className="flex items-start gap-4">
                  <IconTile icon={step.icon} tone="brand" size="md" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {step.title}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Section>
            ))}
          </div>

          <div className="mt-10">
            <Section
              variant="card"
              className="bg-surface-muted"
              title={
                <span className="inline-flex items-center gap-2 text-xl">
                  <IconTile icon={BrainCircuit} tone="brand" size="md" />
                  Not sure what to build yet?
                </span>
              }
              description="A short paid discovery sprint is often the right starting point. We'll map your workflows, identify the highest-leverage AI build, and hand you a written plan you can act on — with us or without us."
            >
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/contact">Book a discovery call</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/about">Meet the team</Link>
                </Button>
              </div>
            </Section>
          </div>
        </div>
      </section>

      <CTABanner
        tone="gradient"
        eyebrow="Forward-Deployed Consulting"
        title="Bring us in to build what your team can't ship alone"
        description="Tell us about the workflow you want to transform. We'll come back with a scoped plan, a timeline, and a fixed-price proposal — usually within a week."
        primary={
          <Button
            asChild
            size="lg"
            className="btn-shimmer w-full bg-marketing-hero-foreground px-8 font-semibold text-marketing-hero-from hover:bg-marketing-hero-foreground/90 sm:w-auto"
          >
            <Link href="/contact">
              Contact us
              <ArrowRight className="ml-2 size-5" aria-hidden />
            </Link>
          </Button>
        }
        secondary={
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="w-full border border-marketing-hero-border bg-transparent px-8 text-marketing-hero-foreground hover:bg-marketing-hero-foreground/10 hover:text-marketing-hero-foreground sm:w-auto"
          >
            <Link href="/about">About our team</Link>
          </Button>
        }
      />
    </>
  )
}
