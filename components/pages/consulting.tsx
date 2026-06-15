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

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CTABanner } from '@/components/marketing/cta-banner'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import { accent, type Accent } from '@/components/pages/home/shared/tones'
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
      "We sit alongside your engineers, accountants, and operators — not at arm's length over a statement of work.",
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
  tone: Accent
  title: string
  description: string
  bullets: string[]
}> = [
  {
    icon: Code2,
    tone: 'blue',
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
    tone: 'emerald',
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
    tone: 'violet',
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
  const a = accent('blue')
  return (
    <motion.div
      className="space-y-4"
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      {DIFFERENTIATORS.map((item) => {
        const Icon = item.icon
        return (
          <motion.div key={item.title} variants={staggerChild}>
            <GlassCard className="p-5">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
                    a.chip,
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {item.title}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {item.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

export default function Consulting() {
  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
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
              className="btn-shimmer w-full bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600 sm:w-auto"
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

      {/* Why forward-deployed */}
      <SectionShell
        surface="background"
        eyebrow="Why forward-deployed?"
        eyebrowIcon={Briefcase}
        eyebrowTone="blue"
        title={
          <>
            Engineers who{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              sit with your team
            </span>
            , ship working tools, and care about business outcomes
          </>
        }
        description="Most AI consulting hands you a strategy deck. We hand you software running in your environment. The difference is who shows up — senior people who understand both the code and the business it serves."
        media={<DifferentiatorStack />}
      />

      {/* What we bring */}
      <SectionShell
        id="what-we-bring"
        surface="surface"
        eyebrow="What we bring"
        eyebrowIcon={Sparkles}
        eyebrowTone="emerald"
        title="Technical depth meets business fluency"
        description="Two skill sets, on the same team. That's what makes an AI build ship — and what makes it keep working after we leave."
      >
        <motion.div
          className="grid grid-cols-1 gap-5 md:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {STRENGTH_PILLARS.map((pillar) => {
            const Icon = pillar.icon
            const a = accent(pillar.tone)
            return (
              <motion.div key={pillar.title} variants={staggerChild}>
                <GlassCard
                  className={cn(
                    'h-full space-y-4 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow',
                    a.hoverBorder,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-11 items-center justify-center rounded-xl',
                        a.chip,
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
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
                        className="flex items-start gap-2 text-sm text-foreground-muted"
                      >
                        <span
                          className={cn(
                            'mt-1.5 size-1.5 shrink-0 rounded-full',
                            a.dot,
                          )}
                          aria-hidden
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            )
          })}
        </motion.div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-foreground-muted">
          Have a build in mind that spans more than one of these? That&apos;s
          usually the point — talk to us about scoping it together.
        </p>
      </SectionShell>

      {/* How we engage */}
      <SectionShell
        surface="background"
        eyebrow="How we engage"
        eyebrowIcon={Compass}
        eyebrowTone="sky"
        title="From first conversation to shipped software"
        description="A predictable four-step shape — scoped tight at the start, with the option to keep going once the tool is in production."
      >
        <motion.div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {ENGAGEMENT_STEPS.map((step) => {
            const Icon = step.icon
            const a = accent('sky')
            return (
              <motion.div key={step.title} variants={staggerChild}>
                <GlassCard className="h-full p-6">
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
                        a.chip,
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {step.title}
                      </p>
                      <p className="text-sm text-foreground-muted">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )
          })}
        </motion.div>

        <motion.div
          className="mt-10"
          variants={staggerChild}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <GlassCard glow className="p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-11 items-center justify-center rounded-xl',
                  accent('amber').chip,
                )}
              >
                <BrainCircuit className="size-5" />
              </span>
              <h3 className="text-xl font-semibold text-foreground">
                Not sure what to build yet?
              </h3>
            </div>
            <p className="mt-4 text-foreground-muted">
              A short paid discovery sprint is often the right starting point.
              We&apos;ll map your workflows, identify the highest-leverage AI
              build, and hand you a written plan you can act on — with us or
              without us.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                asChild
                className="bg-accent-blue-500 text-white hover:bg-accent-blue-600"
              >
                <Link href="/contact">Book a discovery call</Link>
              </Button>
              <Button asChild variant="outline" className="border-border-strong">
                <Link href="/about">Meet the team</Link>
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </SectionShell>

      <CTABanner
        tone="gradient"
        eyebrow="Forward-Deployed Consulting"
        title="Bring us in to build what your team can't ship alone"
        description="Tell us about the workflow you want to transform. We'll come back with a scoped plan, a timeline, and a fixed-price proposal — usually within a week."
        primary={
          <Button
            asChild
            size="lg"
            className="btn-shimmer w-full bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600 sm:w-auto"
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
    </div>
  )
}
