'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { TestimonialCard } from '@/components/marketing/testimonial-card'
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
    <section className="bg-gradient-to-br from-primary-soft/40 via-background to-primary-soft/30 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-14 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Badge
            variant="secondary"
            className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs text-primary-soft-foreground"
          >
            Testimonials
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            What our customers are saying
          </h2>
        </motion.div>

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
                  className="pl-4 md:basis-1/2 lg:basis-1/3"
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
        </motion.div>

        <motion.div
          className="mt-16 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <div className="relative h-full overflow-hidden rounded-xl bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to p-10 text-marketing-hero-foreground shadow-xl">
              <span
                aria-hidden
                className="pointer-events-none absolute -top-32 right-0 size-80 rounded-full bg-marketing-hero-accent/15 blur-3xl"
              />
              <Badge
                variant="outline"
                className="relative mb-4 w-fit border-marketing-hero-border bg-marketing-hero-accent/15 text-marketing-hero-foreground-muted"
              >
                Case study
              </Badge>
              <h3 className="relative mb-4 text-2xl font-semibold tracking-tight">
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
                className="relative bg-marketing-hero-foreground font-semibold text-marketing-hero-from hover:bg-marketing-hero-foreground/90"
              >
                <Link href="/case-study/LFO">Read the full case study →</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div variants={staggerChild}>
            <div className="flex h-full flex-col">
              <h3 className="mb-3 text-lg font-semibold text-foreground">
                Watch our pitch
              </h3>
              <div className="flex-1 overflow-hidden rounded-xl border border-border shadow-md">
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
      </div>
    </section>
  )
}
