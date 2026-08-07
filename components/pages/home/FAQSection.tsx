'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FaqAccordion } from '@/components/marketing/faq-accordion'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
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
    a: 'CPAAutomation includes Universal Document Analysis (extraction & automations), Form Fill, Inkwise (AI writing with grounded citations), AI Project Management (projects, team coordination, time, forms & reporting), Prepared by Client (secure request lists and evidence collection), E-Signature, Chrona (time tracking), the Claw Series of AI digital workers, the AI Analytics Suite (variance, reconciliation, fixed assets, waterfalls & research bots), and a free CPE Tracker.',
  },
]

export default function FAQSection({ onGetStarted }: FAQSectionProps) {
  return (
    <SectionShell
      surface="tint"
      width="narrow"
      eyebrow="FAQ"
      eyebrowIcon={HelpCircle}
      title="Frequently asked questions"
      description="Everything you need to know about CPAAutomation"
    >
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <FaqAccordion
          items={FAQS}
          idPrefix="home-faq"
          /* Dark glass accordion with an accent-blue active/open state. */
          className="glass-card divide-y divide-border border-0 [&_[data-state=open]>button]:text-accent-blue-300 [&_button[data-state=open]>svg]:text-accent-blue-400"
        />
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
          <Button onClick={onGetStarted}>Start free plan</Button>
        </div>
      </motion.div>
    </SectionShell>
  )
}
