'use client'

import { Lock, Mail, MapPin, Shield, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/marketing/feature-card'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { Prose } from '@/components/marketing/prose'
import { Section } from '@/components/ui/section'
import { useCookieConsent } from '@/hooks/useCookieConsent'

const SECURITY_PILLARS = [
  {
    icon: Trash2,
    tone: 'warning' as const,
    title: 'Immediate file deletion',
    description:
      'If you choose not to keep your files stored for later use, they are permanently deleted from our servers immediately after processing is complete.',
  },
  {
    icon: MapPin,
    tone: 'brand' as const,
    title: 'US-only hosting',
    description:
      'All our servers are located exclusively in the United States, ensuring your data remains within US jurisdiction and subject to US privacy laws.',
  },
  {
    icon: Lock,
    tone: 'info' as const,
    title: 'AES-256 encryption',
    description:
      'All data is encrypted using industry-standard AES-256 encryption both in transit and at rest, providing military-grade security for your documents.',
  },
  {
    icon: Shield,
    tone: 'success' as const,
    title: 'Access controls',
    description:
      'Strict access controls limit data access to authorized personnel only, with comprehensive audit logs of all system access and activities.',
  },
]

export default function Privacy() {
  const { openPreferences } = useCookieConsent()

  return (
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        eyebrow={<Badge variant="secondary">Last updated: August 2025</Badge>}
        title="Privacy policy"
        description="How we protect and handle your data at CPAAutomation."
        ctas={
          <Button variant="outline" onClick={openPreferences}>
            Manage cookie preferences
          </Button>
        }
      />

      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl space-y-12 px-4 sm:px-6 lg:px-8">
          <Section
            variant="card"
            className="bg-primary-soft/40 border-primary/15"
          >
            <Prose narrow={false}>
              <h2>Our commitment to privacy</h2>
              <p>
                At CPAAutomation, we understand that your documents contain
                sensitive financial and legal information. We are committed to
                protecting your privacy and maintaining the highest standards of
                data security.
              </p>
              <p>
                This privacy policy explains how we collect, use, and protect
                your information when you use our document extraction services.
              </p>
            </Prose>
          </Section>

          <Section title="Information we collect">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FeatureCard
                tone="brand"
                title="Document data"
                bullets={[
                  'Files you upload for processing (opt-out option provided)',
                  'Extracted data and results from your documents',
                  'Custom extraction rules and templates',
                  'Processing metadata',
                ]}
              />
              <FeatureCard
                tone="success"
                title="Account information"
                bullets={[
                  'Name, email, and company information',
                  'Subscription plan and billing information',
                  'Usage statistics and feature preferences',
                  'Support communication and feedback',
                ]}
              />
              <FeatureCard
                tone="info"
                title="Technical data"
                bullets={[
                  'IP address and browser information',
                  'Device type and operating system',
                  'API usage logs and error reports',
                  'Performance and analytics data',
                ]}
              />
            </div>
          </Section>

          <Section title="How we protect your data">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SECURITY_PILLARS.map((pillar) => (
                <FeatureCard
                  key={pillar.title}
                  icon={pillar.icon}
                  tone={pillar.tone}
                  title={pillar.title}
                  description={pillar.description}
                />
              ))}
            </div>
          </Section>

          <Section variant="card" title="How we use your information">
            <Prose narrow={false}>
              <h3>Service provision</h3>
              <p>
                We use your data solely to provide document extraction
                services, including processing your files, delivering results,
                and maintaining your account.
              </p>
              <h3>Service improvement</h3>
              <p>
                Anonymous, aggregated usage data helps us improve our AI models
                and service quality. No personally identifiable information is
                used for this purpose.
              </p>
              <h3>Customer support</h3>
              <p>
                We may access your account information to provide technical
                support, resolve issues, and respond to your inquiries.
              </p>
              <h3>Legal compliance</h3>
              <p>
                We may process data as required by law, regulation, or legal
                process, but will notify you when legally permitted to do so.
              </p>
            </Prose>
          </Section>

          <Section
            variant="card"
            className="border-destructive/30 bg-destructive-soft/40"
            title="Data sharing & third parties"
          >
            <Prose narrow={false}>
              <h3>We do not sell your data</h3>
              <p>
                CPAAutomation does not sell, rent, or trade your personal
                information or document data to third parties for marketing or
                any other commercial purposes.
              </p>
              <h4>Limited third-party services</h4>
              <p>
                We may use trusted third-party services for specific functions
                such as payment processing, email delivery, and hosting
                infrastructure. These providers are contractually bound to
                protect your data.
              </p>
              <h4>Business transfers</h4>
              <p>
                In the event of a merger, acquisition, or sale of assets, your
                information may be transferred as part of the business
                transaction, subject to the same privacy protections.
              </p>
            </Prose>
          </Section>

          <Section title="Your rights and choices">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FeatureCard
                tone="brand"
                title="Access and portability"
                description="You have the right to access your account data and export your extraction templates and results in a portable format at any time."
              />
              <FeatureCard
                tone="info"
                title="Correction and updates"
                description="You can update your account information, preferences, and settings through your dashboard or by contacting our support team."
              />
              <FeatureCard
                tone="warning"
                title="Account deletion"
                description="You may delete your account at any time. Upon deletion, all your data will be permanently removed from our systems within 30 days."
              />
            </div>
          </Section>

          <Section variant="card" className="bg-surface-muted">
            <div className="flex items-start gap-4">
              <FeatureCard
                icon={Mail}
                tone="brand"
                title="Questions about your privacy?"
                description={
                  <>
                    <p>
                      If you have questions about this privacy policy or how we
                      handle your data, please contact us:
                    </p>
                    <p className="mt-2">Email: privacy@CPAAutomation.ai</p>
                    <p>Address: United States (US-based support team)</p>
                  </>
                }
                className="border-0 bg-transparent shadow-none"
              />
            </div>
          </Section>

          <Section variant="card">
            <Prose narrow={false}>
              <h2>Policy updates</h2>
              <p>
                We may update this privacy policy from time to time. We will
                notify you of any material changes by email and by posting the
                updated policy on our website. Your continued use of
                CPAAutomation after such changes constitutes acceptance of the
                updated policy.
              </p>
            </Prose>
          </Section>
        </div>
      </section>
    </>
  )
}
