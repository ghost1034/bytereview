'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { TestimonialCard } from '@/components/marketing/testimonial-card'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const TESTIMONIALS = [
  {
    company: 'A*** Manufacturing',
    person: 'D*** Wilton, Supply Chain Director',
    headline: 'Handles complex supplier documents',
    quote:
      'We process thousands of supplier certifications, quality reports, and invoices monthly. The custom extraction feature lets us automatically categorize materials by grade and extract compliance codes for our procurement system.',
  },
  {
    company: 'S****** Ventures',
    person: 'J*** Park, Partner',
    headline: 'Essential for due diligence',
    quote:
      "We evaluate hundreds of companies quarterly. Extracting financial metrics, revenue breakdowns, and key performance indicators from pitch decks and financial statements used to take weeks. Now it's literally done in minutes.",
  },
  {
    company: 'N********** Technologies',
    person: 'A*** Kumar, CLO',
    headline: 'Accelerates contract processing',
    quote:
      'Our legal team reviews hundreds of vendor agreements monthly. We now extract key terms, pricing structures, and SLA commitments automatically. What used to take 3 hours per contract now takes two minutes.',
  },
]

export default function Testimonials() {
  return (
    <SectionShell
      surface="surface"
      eyebrow="Testimonials"
      title="What our customers are saying"
      background={
        <span
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-accent-blue-500/10 blur-[140px]"
        />
      }
    >
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <Carousel opts={{ align: 'start', loop: true }} className="w-full">
          <CarouselContent className="-ml-4">
            {TESTIMONIALS.map((t) => (
              <CarouselItem
                key={t.company}
                /* Glass treatment + accent-blue star ratings on the dark card. */
                className="pl-4 md:basis-1/2 lg:basis-1/3 [&_figure]:glass-card [&_figure]:border-0 [&_[aria-label$='stars']]:text-accent-blue-400"
              >
                <TestimonialCard
                  quote={
                    <>
                      <strong className="block text-foreground mb-2">
                        {t.headline}
                      </strong>
                      {t.quote}
                    </>
                  }
                  author={t.company}
                  role={t.person}
                  rating={5}
                  className="h-full"
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="mt-6 flex justify-center gap-2">
            <CarouselPrevious
              aria-label="Previous testimonial"
              className="static translate-y-0 border-border"
            />
            <CarouselNext
              aria-label="Next testimonial"
              className="static translate-y-0 border-border"
            />
          </div>
        </Carousel>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-foreground-subtle">
          <Lock className="size-3.5" aria-hidden />
          Names abbreviated at our clients&rsquo; request to protect confidentiality.
        </p>
      </motion.div>

      <motion.div
        className="mt-16 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <motion.div variants={staggerChild}>
          <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to p-10 text-marketing-hero-foreground shadow-glow">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-32 right-0 size-80 rounded-full bg-marketing-hero-accent/15 blur-3xl"
            />
            <span className="relative inline-flex w-fit items-center rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-blue-300">
              Case study
            </span>
            <h3 className="relative mb-4 mt-4 text-2xl font-semibold tracking-tight">
              A leading family office saves hundreds of hours per year
              processing investment statements
            </h3>
            <p className="relative mb-8 text-base leading-relaxed text-marketing-hero-foreground-muted">
              &ldquo;Our team used to spend weeks manually extracting
              financial data from portfolio reports. Now we process quarterly
              statements from 100+ companies in just minutes with perfect
              accuracy.&rdquo;
            </p>
            <Button
              asChild
              className="relative bg-accent-blue-500 font-semibold text-white hover:bg-accent-blue-600"
            >
              <Link href="/case-study/LFO">Read the full case study</Link>
            </Button>
          </div>
        </motion.div>

        <motion.div variants={staggerChild}>
          <div className="flex h-full flex-col">
            <h3 className="mb-3 text-lg font-semibold text-foreground">
              Watch our pitch
            </h3>
            <div className="flex-1 overflow-hidden rounded-2xl border border-border shadow-glow">
              <div className="relative aspect-video bg-marketing-hero-from">
                <iframe
                  className="absolute inset-0 h-full w-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/vhFcyZh07b8?si=miMLgbIVkr9Q6Pdo"
                  title="Watch our pitch"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </SectionShell>
  )
}
