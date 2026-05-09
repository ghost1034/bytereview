import Image from 'next/image'
import Link from 'next/link'
import { Award, CheckCircle, Target, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/marketing/feature-card'
import { IconTile } from '@/components/ui/icon-tile'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { Section } from '@/components/ui/section'
import { TestimonialCard } from '@/components/marketing/testimonial-card'

const VALUES = [
  {
    title: 'Professional accuracy',
    description:
      'Every extraction rule is designed and tested by professionals who use these documents daily in their practice.',
  },
  {
    title: 'Data security',
    description:
      'We prioritize your data security with immediate file deletion post-processing and US-only server hosting.',
  },
  {
    title: 'Customizable flexibility',
    description:
      'While our base rules are professionally designed, users can create custom prompts for maximum flexibility.',
  },
  {
    title: 'Enterprise ready',
    description:
      'Built to scale with dedicated US-based support and custom integrations for enterprise workflows.',
  },
]

export default function About() {
  return (
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        title="About us"
        description="Truly customizable document AI engineered from real CPA workflows."
      />

      <section className="bg-background pb-16 pt-8 sm:pb-20 sm:pt-10">
        <div className="mx-auto max-w-4xl space-y-16 px-4 sm:px-6 lg:px-8">
          <div>
            <h2 className="mb-12 text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
              Founder &amp; engineer
            </h2>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="order-2 lg:order-1">
                <h3 className="text-xl font-semibold text-foreground">
                  Ian Stewart
                </h3>
                <p className="mb-6 mt-1 text-sm text-foreground-muted">
                  Senior at Abraham Lincoln High School in San Francisco
                </p>
                <div className="space-y-4 text-foreground-muted">
                  <p>
                    CPAAutomation.ai started with a simple question: why are
                    CPAs still buried in repetitive, manual tasks when
                    technology can assist?
                  </p>
                  <p>
                    For me, this mission is personal. I grew up watching my mom
                    work long hours as a CPA, juggling endless paperwork that
                    kept her from focusing on the parts of the job that truly
                    mattered: serving clients and solving problems.
                  </p>
                  <p>
                    I combined my passion for coding with this firsthand
                    perspective. The result was CPAAutomation.ai: a platform
                    built to streamline workflows, reduce busywork, and give
                    CPAs back their time.
                  </p>
                  <p>
                    What began as a personal project has grown into a bigger
                    vision: empowering accountants everywhere to work smarter,
                    not harder.
                  </p>
                </div>
              </div>
              <div className="order-1 flex justify-center lg:order-2">
                <div className="size-80 overflow-hidden rounded-lg shadow-lg ring-1 ring-border">
                  <Image
                    src="/ian.jpg"
                    alt="Ian Stewart, Founder of CPAAutomation"
                    width={320}
                    height={320}
                    className="size-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-12 text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
              Vetted by industry experts
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <TestimonialCard
                quote="Provided extensive validation of our extraction algorithms for healthcare industry financial documents and compliance requirements."
                author="Rae Stewart"
                role="Senior Director, Accounting"
                company="Kaiser Permanente"
              />
              <TestimonialCard
                quote="Validated our platform's ability to handle complex technology sector financial processes and automation workflows."
                author="Ray Sang"
                role="Director of Accounting Systems & Process Transformation"
                company="SentinelOne"
              />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="mb-6 text-balance text-3xl font-semibold tracking-tight text-foreground">
                  Our mission
                </h2>
                <p className="mb-4 text-lg text-foreground-muted">
                  CPAAutomation was created to bridge the gap between
                  traditional document processing and modern AI capabilities.
                  We understand that financial and legal professionals need
                  extraction tools that truly comprehend the nuances of their
                  documents.
                </p>
                <p className="text-lg text-foreground-muted">
                  Our platform combines deep domain expertise from certified
                  professionals with cutting-edge AI technology to deliver
                  extraction accuracy that meets the rigorous standards of
                  accounting and legal workflows.
                </p>
              </div>
              <div className="flex justify-center">
                <IconTile
                  icon={Target}
                  tone="brand"
                  size="lg"
                  className="size-64 rounded-2xl"
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-12 text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
              Built by professionals, for professionals
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FeatureCard
                icon={Award}
                tone="success"
                title="CPA expertise"
                description="Our extraction algorithms are developed and validated by certified public accountants who understand the complexities of financial document processing and compliance requirements."
              />
              <FeatureCard
                icon={Users}
                tone="info"
                title="Legal validation"
                description="Licensed attorneys contribute to our extraction rule development, ensuring that our AI understands legal document structures and meets professional standards for data accuracy."
              />
            </div>
          </div>

          <div>
            <h2 className="mb-12 text-center text-balance text-3xl font-semibold tracking-tight text-foreground">
              Our values
            </h2>
            <div className="space-y-6">
              {VALUES.map((value) => (
                <div key={value.title} className="flex items-start gap-3">
                  <CheckCircle
                    className="mt-1 size-6 shrink-0 text-success"
                    aria-hidden
                  />
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      {value.title}
                    </h3>
                    <p className="text-foreground-muted">{value.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Section
            variant="card"
            className="bg-surface-muted text-center"
            title="Questions about our platform?"
            description="Connect with our team to learn more about how CPAAutomation can transform your document processing workflow."
          >
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/contact">Contact us</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/demo">View demo</Link>
              </Button>
            </div>
          </Section>
        </div>
      </section>
    </>
  )
}
