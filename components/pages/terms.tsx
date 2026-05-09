import { AlertTriangle, FileText, Mail } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { FeatureCard } from '@/components/marketing/feature-card'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { Prose } from '@/components/marketing/prose'
import { Section } from '@/components/ui/section'

export default function Terms() {
  return (
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        eyebrow={<Badge variant="secondary">Last updated: August 2025</Badge>}
        title="Terms of service"
        description="Legal terms and conditions for using CPAAutomation."
      />

      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl space-y-12 px-4 sm:px-6 lg:px-8">
          <Section
            variant="card"
            className="border-primary/15 bg-primary-soft/40"
          >
            <div className="flex items-start gap-4">
              <FeatureCard
                icon={FileText}
                tone="brand"
                title="Acceptance of terms"
                description={
                  <>
                    <p>
                      By accessing or using CPAAutomation&apos;s document
                      processing services, you agree to be bound by these
                      Terms of Service. If you do not agree to these terms,
                      please do not use our services.
                    </p>
                    <p className="mt-3">
                      These terms constitute a legal agreement between you and
                      CPAAutomation regarding your use of our platform.
                    </p>
                  </>
                }
                className="border-0 bg-transparent shadow-none"
              />
            </div>
          </Section>

          <Section variant="card" title="Service description">
            <Prose narrow={false}>
              <h3>What we provide</h3>
              <ul>
                <li>AI-powered document data extraction services</li>
                <li>Custom extraction rule creation and templates</li>
                <li>
                  Professional-grade processing developed by CPAs and lawyers
                </li>
                <li>
                  Export capabilities to Excel, Google Sheets, and CSV formats
                </li>
                <li>API access for integration with your existing systems</li>
                <li>Customer support and technical assistance</li>
              </ul>
            </Prose>
            <Alert className="mt-4">
              <AlertDescription>
                <strong>Service availability:</strong> We strive to maintain
                99.9% uptime but cannot guarantee uninterrupted service.
                Scheduled maintenance will be announced in advance when
                possible.
              </AlertDescription>
            </Alert>
          </Section>

          <Section title="User responsibilities">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FeatureCard
                tone="success"
                title="Account security"
                bullets={[
                  'Maintain the confidentiality of your account credentials',
                  'Notify us immediately of any unauthorized account access',
                  'Use strong passwords and enable two-factor authentication',
                  'Do not share your API keys or account access',
                ]}
              />
              <FeatureCard
                tone="info"
                title="Document upload requirements"
                bullets={[
                  'Only upload documents you own or have permission to process',
                  'Ensure documents do not contain malware or malicious code',
                  'Comply with all applicable laws regarding document processing',
                  'Do not upload documents containing illegal content',
                ]}
              />
              <FeatureCard
                tone="warning"
                title="Acceptable use"
                bullets={[
                  'Use the service only for legitimate business purposes',
                  'Do not attempt to reverse engineer our systems',
                  'Respect usage limits based on your subscription plan',
                  'Do not process documents for competitive analysis',
                ]}
              />
            </div>
          </Section>

          <Section variant="card" title="Billing and payments">
            <Prose narrow={false}>
              <h4>Subscription plans</h4>
              <p>
                Monthly subscriptions are billed in advance on the same day
                each month. Annual plans are billed annually in advance.
              </p>
              <ul>
                <li>Basic plan: $9.99/month for 500 pages</li>
                <li>Professional plan: $49.99/month for 5,000 pages</li>
                <li>
                  Enterprise plan: custom pricing with unlimited pages and
                  users
                </li>
              </ul>

              <h4>Payment processing</h4>
              <p>
                Payments are processed securely through our payment providers.
                We accept major credit cards and ACH transfers for enterprise
                accounts.
              </p>

              <h4>Refunds and cancellations</h4>
              <p>
                You may cancel your subscription at any time. Cancellations
                take effect at the end of your current billing period. We do
                not provide refunds for partial months or unused pages.
              </p>

              <h4>Late payments</h4>
              <p>
                Accounts with failed payments may be suspended after 7 days.
                Service will be restored upon successful payment.
              </p>
            </Prose>
          </Section>

          <Section variant="card" title="Intellectual property">
            <Prose narrow={false}>
              <h3>Our rights</h3>
              <p>
                CPAAutomation retains all rights to our software, algorithms,
                AI models, and extraction methodologies. Users receive a
                license to use our services but do not acquire ownership
                rights.
              </p>

              <h3>Your rights</h3>
              <p>
                You retain all rights to your uploaded documents and extracted
                data. We do not claim ownership of your content and will not
                use it for any purpose other than providing our services.
              </p>

              <h3>License grant</h3>
              <p>
                You grant us a limited license to process your documents
                solely for the purpose of providing extraction services. This
                license terminates when files are deleted from our systems.
              </p>
            </Prose>
          </Section>

          <Section
            variant="card"
            className="border-warning/30 bg-warning-soft/40"
          >
            <div className="flex items-start gap-4">
              <FeatureCard
                icon={AlertTriangle}
                tone="warning"
                title="Important disclaimers"
                className="border-0 bg-transparent shadow-none"
              />
            </div>
            <Prose narrow={false} className="mt-4">
              <h4>Accuracy disclaimer</h4>
              <p>
                While our AI extraction is designed and validated by CPAs and
                lawyers, we cannot guarantee 100% accuracy. Users should
                review and verify extracted data before using it for business
                decisions.
              </p>

              <h4>Service availability</h4>
              <p>
                We provide services on an &ldquo;as is&rdquo; basis and cannot
                guarantee uninterrupted access. Maintenance, updates, or
                technical issues may temporarily affect service availability.
              </p>

              <h4>Limitation of liability</h4>
              <p>
                Our liability is limited to the amount paid for services in
                the preceding 12 months. We are not liable for indirect,
                incidental, or consequential damages.
              </p>
            </Prose>
          </Section>

          <Section variant="card" title="Termination">
            <Prose narrow={false}>
              <h3>User-initiated termination</h3>
              <p>
                You may terminate your account at any time through your
                dashboard settings or by contacting support. Upon termination,
                your data will be deleted within 30 days.
              </p>

              <h3>Service-initiated termination</h3>
              <p>
                We may suspend or terminate accounts for violation of these
                terms, illegal activity, or non-payment. We will provide
                notice when possible before termination.
              </p>

              <h3>Effect of termination</h3>
              <p>
                Upon termination, your access to the service will cease
                immediately. You may export your data before termination, as
                we cannot guarantee data availability afterward.
              </p>
            </Prose>
          </Section>

          <Section variant="card" title="Governing law">
            <Prose narrow={false}>
              <p>
                These Terms of Service are governed by the laws of the United
                States. Any disputes will be resolved through binding
                arbitration in accordance with the rules of the American
                Arbitration Association.
              </p>
              <p>
                If any provision of these terms is found to be unenforceable,
                the remaining provisions will remain in full force and effect.
              </p>
            </Prose>
          </Section>

          <Section variant="card" className="bg-surface-muted">
            <FeatureCard
              icon={Mail}
              tone="brand"
              title="Questions about these terms?"
              description={
                <>
                  <p>
                    If you have questions about these Terms of Service, please
                    contact us:
                  </p>
                  <p className="mt-2">Email: legal@CPAAutomation.ai</p>
                  <p>Address: United States (US-based legal team)</p>
                </>
              }
              className="border-0 bg-transparent shadow-none"
            />
          </Section>

          <Section variant="card" title="Terms updates">
            <Prose narrow={false}>
              <p>
                We may update these Terms of Service from time to time.
                Material changes will be communicated via email and posted on
                our website 30 days before taking effect. Continued use of our
                services after changes indicates acceptance of the updated
                terms.
              </p>
            </Prose>
          </Section>
        </div>
      </section>
    </>
  )
}
