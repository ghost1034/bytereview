'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FaqAccordion } from '@/components/marketing/faq-accordion'
import { fadeInUp, viewportOnce } from '@/lib/animations'

interface FAQSectionProps {
  onGetStarted: () => void
}

const FAQS = [
  {
    q: 'How accurate is the AI extraction?',
    a: 'Our AI achieves 99%+ accuracy on structured documents like invoices and financial statements. For complex documents, accuracy typically ranges from 95-99%. You can always review and edit results before export.',
  },
  {
    q: 'What file types are supported?',
    a: 'We support PDF, DOCX, XLSX, PPTX, TXT, CSV, and most image formats (PNG, JPG, TIFF). We can also process scanned documents and handle multi-page files with complex layouts.',
  },
  {
    q: 'How does email automation work?',
    a: 'Simply forward emails with PDF attachments to document@cpaautomation.ai. Our system matches your sender email to your account, applies your automation filters, and processes documents using your configured templates. Results are automatically exported to your chosen destination.',
  },
  {
    q: 'Can I customize the extraction fields?',
    a: 'Absolutely! You can create custom fields with your own prompts, data types, and formatting rules. Add accounting codes, classification rules, or any business-specific logic. Templates can be saved and reused across projects.',
  },
  {
    q: 'Is there a learning curve?',
    a: "CPAAutomation is designed for professionals who don't have time for complex training. Most users are extracting data within 10 minutes of signing up. Our CPA-designed interface follows familiar workflows.",
  },
  {
    q: 'What about data security and privacy?',
    a: 'Your data is encrypted in transit and at rest, hosted only in US data centers, and automatically deleted after processing. We never use your documents to train AI models. Our platform meets the security standards required by CPA firms and legal practices.',
  },
  {
    q: 'What products are included in CPAAutomation?',
    a: 'CPAAutomation includes Universal Document Analysis (extraction & automations), Inkwise (AI writing with grounded citations), the AI Analytics Suite (variance, reconciliation, fixed assets, waterfalls & research bots), a free CPE Tracker, and upcoming products: Chrona (time tracking), AI agents for accounting/finance/legal, and an AI Productivity Suite.',
  },
]

export default function FAQSection({ onGetStarted }: FAQSectionProps) {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-12 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Badge
            variant="secondary"
            className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
          >
            FAQ
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-lg text-foreground-muted">
            Everything you need to know about CPAAutomation
          </p>
        </motion.div>

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <FaqAccordion items={FAQS} />
        </motion.div>

        <motion.div
          className="mt-12 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <p className="mb-6 text-foreground-muted">
            Still have questions? We&apos;re here to help.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/contact">Contact support</Link>
            </Button>
            <Button onClick={onGetStarted}>Start free plan →</Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
