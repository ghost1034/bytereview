import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Clock,
  DollarSign,
  TrendingUp,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { MetricCard } from '@/components/marketing/metric-card'
import { Section } from '@/components/ui/section'
import { TestimonialCard } from '@/components/marketing/testimonial-card'

const PAIN_POINTS = [
  'Manual extraction of financial metrics from 100+ portfolio companies quarterly',
  'Inconsistent document formats from different companies',
  'Time-sensitive quarterly reporting deadlines',
  'Risk of human error in data transcription',
  'Limited scalability for growing portfolio',
]

const IMPLEMENTATION = [
  'Custom extraction templates for revenue, equity, and valuation metrics',
  'Automated classification of valuation types',
  'Recognition of different foreign currencies used in statements',
  'Quality assurance workflows for data validation',
]

export default function CaseStudyLFO() {
  return (
    <>
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
        title="Leonardo Family Office case study"
        description="How a leading family office firm automated investment statement processing and saved hundreds of hours annually."
      />

      <section className="bg-surface-muted py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Clock}
              tone="brand"
              label="Hours saved annually"
              value="200+"
            />
            <MetricCard
              icon={Users}
              tone="success"
              label="Portfolio companies"
              value="100+"
              sublabel="Processed quarterly"
            />
            <MetricCard
              icon={TrendingUp}
              tone="info"
              label="Time reduction"
              value="95%"
            />
            <MetricCard
              icon={DollarSign}
              tone="warning"
              label="Annual savings"
              value="$100K+"
            />
          </div>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-6 text-balance text-3xl font-semibold tracking-tight text-foreground">
                About Leonardo Family Office
              </h2>
              <p className="mb-6 text-lg text-foreground-muted">
                Leonardo Family Office (LFO) is a leading ESG and
                technology-focused family office management firm.
              </p>
              <ul className="space-y-3">
                {[
                  'ESG & technology-focused family office',
                  '100+ portfolio companies',
                  'Quarterly reporting cycles',
                  '15+ investment professionals',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-foreground-muted"
                  >
                    <Check className="size-5 shrink-0 text-primary" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-xl border border-border shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-4.0.3&w=600&h=400&fit=crop"
                alt="Investment team meeting"
                className="h-auto w-full"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-muted py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
            The challenge
          </h2>
          <Section variant="card">
            <p className="mb-6 text-lg text-foreground-muted">
              LFO&apos;s investment team was spending an overwhelming amount of
              time manually processing quarterly financial statements from
              their portfolio companies.
            </p>

            <h3 className="mb-4 text-xl font-semibold text-foreground">
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
          </Section>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
            The solution
          </h2>
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-border shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&w=600&h=400&fit=crop"
                alt="Data extraction dashboard"
                className="h-auto w-full"
                loading="lazy"
              />
            </div>
            <div>
              <p className="mb-6 text-lg text-foreground-muted">
                Leonardo Family Office implemented our PDF extraction platform
                to automate their quarterly reporting workflow. The solution
                included custom extraction templates for financial metrics and
                automated data validation.
              </p>

              <h3 className="mb-4 text-xl font-semibold text-foreground">
                Implementation features
              </h3>
              <ul className="space-y-3">
                {IMPLEMENTATION.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-foreground-muted"
                  >
                    <Check className="size-5 shrink-0 text-success" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-primary-soft/30 py-16">
        <div className="mx-auto max-w-4xl space-y-8 px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
            Results &amp; impact
          </h2>

          <TestimonialCard
            quote='Our team used to spend weeks manually extracting financial data from portfolio reports. Now we process quarterly statements from 100+ companies in just minutes with perfect accuracy. This transformation has allowed our investment professionals to focus on what they do best: identifying opportunities and supporting our portfolio companies.'
            author="C**** Leonardo"
            role="CFO"
            company="Leonardo Family Office"
            rating={5}
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Section variant="card" title="Time savings">
              <ul className="space-y-2 text-foreground-muted">
                <li>• Quarterly processing reduced from 3 days to 2 hours</li>
                <li>• Individual report processing: 30 min → 5 sec</li>
                <li>• 95% reduction in manual data entry</li>
                <li>• Freed up 200+ hours annually</li>
              </ul>
            </Section>
            <Section variant="card" title="Quality improvements">
              <ul className="space-y-2 text-foreground-muted">
                <li>• 99.8% accuracy in data extraction</li>
                <li>• Eliminated transcription errors</li>
                <li>• Standardized data formats across portfolio</li>
                <li>• Real-time validation and error detection</li>
              </ul>
            </Section>
          </div>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-balance text-3xl font-semibold tracking-tight text-foreground">
            Ready to transform your document processing?
          </h2>
          <p className="mb-8 text-balance text-xl text-foreground-muted">
            See how our PDF extraction platform can help your organization save
            time and improve accuracy.
          </p>
          <Button asChild size="lg">
            <Link href="/demo">Try it now</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
