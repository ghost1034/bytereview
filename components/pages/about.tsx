'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Award,
  Building2,
  Quote,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import { accent } from '@/components/pages/home/shared/tones'
import {
  fadeInUp,
  scaleIn,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const TESTIMONIALS = [
  {
    quote:
      'Provided extensive validation of our extraction algorithms for healthcare industry financial documents and compliance requirements.',
    author: 'Rae Stewart',
    role: 'Senior Director, Accounting',
    company: 'Kaiser Permanente',
  },
  {
    quote:
      "Validated our platform's ability to handle complex technology sector financial processes and automation workflows.",
    author: 'Ray Sang',
    role: 'Finance Systems',
    company: 'Plaid, Inc.',
  },
]

const EXPERTISE = [
  {
    icon: Award,
    tone: 'cyan' as const,
    title: 'CPA expertise',
    description:
      'Our extraction algorithms are developed and validated by certified public accountants who understand the complexities of financial document processing and compliance requirements.',
  },
  {
    icon: Scale,
    tone: 'violet' as const,
    title: 'Legal validation',
    description:
      'Licensed attorneys contribute to our extraction rule development, ensuring that our AI understands legal document structures and meets professional standards for data accuracy.',
  },
]

const VALUES = [
  {
    icon: Target,
    title: 'Professional accuracy',
    description:
      'Every extraction rule is designed and tested by professionals who use these documents daily in their practice.',
  },
  {
    icon: ShieldCheck,
    title: 'Data security',
    description:
      'We prioritize your data security with immediate file deletion post-processing and US-only server hosting.',
  },
  {
    icon: Sparkles,
    title: 'Customizable flexibility',
    description:
      'While our base rules are professionally designed, users can create custom prompts for maximum flexibility.',
  },
  {
    icon: Building2,
    title: 'Enterprise ready',
    description:
      'Built to scale with dedicated US-based support and custom integrations for enterprise workflows.',
  },
]

export default function About() {
  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="narrow"
        eyebrow="About us"
        title={
          <>
            Document AI, engineered from real{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              CPA workflows
            </span>
          </>
        }
        description="Truly customizable document AI built by professionals who live inside these documents every day."
      />

      {/* Founder */}
      <SectionShell
        surface="background"
        eyebrow="Our story"
        eyebrowIcon={Sparkles}
        eyebrowTone="blue"
        title="Founder & engineer"
        media={
          <motion.div
            variants={scaleIn}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="relative mx-auto w-full max-w-sm"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-4 rounded-3xl bg-accent-blue-500/15 blur-2xl"
            />
            <div className="relative overflow-hidden rounded-2xl shadow-glow ring-1 ring-border">
              <Image
                src="/ian.jpg"
                alt="Ian Stewart, Founder of CPAAutomation"
                width={420}
                height={420}
                className="size-full object-cover"
              />
            </div>
          </motion.div>
        }
      >
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h3 className="text-xl font-semibold text-foreground">Ian Stewart</h3>
          <p className="mb-6 mt-1 text-sm text-foreground-subtle">
            Incoming First-Year at University of California, Berkeley
          </p>
          <div className="space-y-4 text-foreground-muted">
            <p>
              CPAAutomation.ai started with a simple question: why are CPAs still
              buried in repetitive, manual tasks when technology can assist?
            </p>
            <p>
              For me, this mission is personal. I grew up watching my mom work
              long hours as a CPA, juggling endless paperwork that kept her from
              focusing on the parts of the job that truly mattered: serving
              clients and solving problems.
            </p>
            <p>
              I combined my passion for coding with this firsthand perspective.
              The result was CPAAutomation.ai: a platform built to streamline
              workflows, reduce busywork, and give CPAs back their time.
            </p>
            <p>
              What began as a personal project has grown into a bigger vision:
              empowering accountants everywhere to work smarter, not harder.
            </p>
          </div>
        </motion.div>
      </SectionShell>

      {/* Vetted by industry experts */}
      <SectionShell
        surface="surface"
        eyebrow="Validation"
        eyebrowIcon={ShieldCheck}
        eyebrowTone="emerald"
        title="Vetted by industry experts"
        description="Senior practitioners across accounting and finance pressure-tested our extraction against the documents they work with every day."
      >
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {TESTIMONIALS.map((t) => (
            <motion.div key={t.author} variants={staggerChild}>
              <GlassCard className="flex h-full flex-col p-6">
                <Quote
                  className={cn('size-7', accent('emerald').text)}
                  aria-hidden
                />
                <p className="mt-4 flex-1 text-foreground-muted">{t.quote}</p>
                <div className="mt-6 border-t border-border pt-4">
                  <p className="font-semibold text-foreground">{t.author}</p>
                  <p className="text-sm text-foreground-subtle">
                    {t.role} · {t.company}
                  </p>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </SectionShell>

      {/* Mission */}
      <SectionShell
        surface="background"
        reverse
        eyebrow="Our mission"
        eyebrowIcon={Target}
        eyebrowTone="violet"
        title="Bridging documents and modern AI"
        media={
          <motion.div
            variants={scaleIn}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <GlassCard
              glow
              className="flex aspect-[4/3] flex-col items-center justify-center gap-5 p-10 text-center"
            >
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-20 items-center justify-center rounded-2xl',
                  accent('violet').chip,
                )}
              >
                <Target className="size-9" />
              </span>
              <p className="max-w-xs text-foreground-muted">
                Extraction accuracy that meets the rigorous standards of
                accounting and legal workflows.
              </p>
            </GlassCard>
          </motion.div>
        }
      >
        <motion.div
          className="space-y-4 text-foreground-muted"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <p>
            CPAAutomation was created to bridge the gap between traditional
            document processing and modern AI capabilities. We understand that
            financial and legal professionals need extraction tools that truly
            comprehend the nuances of their documents.
          </p>
          <p>
            Our platform combines deep domain expertise from certified
            professionals with cutting-edge AI technology to deliver extraction
            accuracy that meets the rigorous standards of accounting and legal
            workflows.
          </p>
        </motion.div>
      </SectionShell>

      {/* Built by professionals */}
      <SectionShell
        surface="surface"
        eyebrow="Built by professionals"
        eyebrowIcon={Users}
        eyebrowTone="cyan"
        title="Built by professionals, for professionals"
      >
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {EXPERTISE.map((item) => {
            const Icon = item.icon
            const a = accent(item.tone)
            return (
              <motion.div key={item.title} variants={staggerChild}>
                <GlassCard
                  className={cn(
                    'h-full p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow',
                    a.hoverBorder,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mb-5 inline-flex size-11 items-center justify-center rounded-xl',
                      a.chip,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm text-foreground-muted">
                    {item.description}
                  </p>
                </GlassCard>
              </motion.div>
            )
          })}
        </motion.div>
      </SectionShell>

      {/* Values */}
      <SectionShell
        surface="background"
        eyebrow="What we stand for"
        eyebrowIcon={Sparkles}
        eyebrowTone="amber"
        title="Our values"
      >
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {VALUES.map((value) => {
            const Icon = value.icon
            const a = accent('amber')
            return (
              <motion.div key={value.title} variants={staggerChild}>
                <GlassCard className="flex h-full gap-4 p-6">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
                      a.chip,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      {value.title}
                    </h3>
                    <p className="text-foreground-muted">{value.description}</p>
                  </div>
                </GlassCard>
              </motion.div>
            )
          })}
        </motion.div>
      </SectionShell>

      {/* CTA */}
      <SectionShell
        surface="surface"
        width="narrow"
        eyebrow="Get in touch"
        eyebrowIcon={Sparkles}
        eyebrowTone="blue"
        title="Questions about our platform?"
        description="Connect with our team to learn more about how CPAAutomation can transform your document processing workflow."
        background={
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 size-[420px] -translate-x-1/2 rounded-full bg-accent-blue-500/15 blur-3xl"
          />
        }
      >
        <motion.div
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
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
            <Link href="/contact">Contact us</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-border-strong px-8"
          >
            <Link href="/demo">View demo</Link>
          </Button>
        </motion.div>
      </SectionShell>
    </div>
  )
}
