'use client'

import { motion } from 'framer-motion'
import { Bot, FolderOutput, Mail } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import { CodeBlock } from '@/components/marketing/code-block'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

interface AutomationFlowProps {
  onGetStarted: () => void
}

const STEPS = [
  {
    number: 1,
    icon: Mail,
    tone: 'brand' as const,
    title: 'Forward or send emails to document@cpaautomation.ai',
    description:
      'Any email with PDF attachments automatically triggers processing.',
  },
  {
    number: 2,
    icon: Bot,
    tone: 'brand' as const,
    title: 'AI extracts data using your templates',
    description: "Custom fields, prompts, and rules you've configured.",
  },
  {
    number: 3,
    icon: FolderOutput,
    tone: 'success' as const,
    title: 'Results auto-exported to Google Drive',
    description: 'CSV and Excel files delivered exactly where you need them.',
  },
]

const FILTERS = [
  'subject:invoice has:attachment',
  'from:vendor@company.com filename:pdf',
  'subject:"monthly report" has:attachment',
]

export default function AutomationFlow({ onGetStarted }: AutomationFlowProps) {
  return (
    <section className="bg-primary-soft/30 py-24">
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
            className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
          >
            Automations
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Set it and forget it
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-foreground-muted">
            Email attachments → AI extraction → automated delivery. Zero manual
            work.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <ol className="space-y-1">
              {STEPS.map((step, i) => (
                <li key={step.number}>
                  <motion.div
                    className="flex items-start gap-4 rounded-xl border border-border bg-surface-raised p-4 shadow-xs"
                    variants={staggerChild}
                  >
                    <IconTile
                      icon={step.icon}
                      tone={step.tone}
                      size="md"
                    />
                    <div className="pt-0.5">
                      <h4 className="font-semibold text-foreground">
                        <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {step.number}
                        </span>
                        {step.title}
                      </h4>
                      <p className="mt-1 text-sm text-foreground-muted">
                        {step.description}
                      </p>
                    </div>
                  </motion.div>
                  {i < STEPS.length - 1 && (
                    <motion.div
                      className="ml-9 my-0 flex justify-start"
                      variants={staggerChild}
                    >
                      <div className="h-6 w-px border-l-2 border-dashed border-border" />
                    </motion.div>
                  )}
                </li>
              ))}
            </ol>

            <motion.div
              className="mt-6 rounded-xl border border-border bg-surface-raised p-5 shadow-xs"
              variants={staggerChild}
            >
              <p className="mb-3 text-sm font-semibold text-foreground">
                Popular automation filters
              </p>
              <div className="space-y-2">
                {FILTERS.map((f) => (
                  <CodeBlock key={f} copyable={false} className="border-0">
                    {f}
                  </CodeBlock>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className="rounded-xl border border-border bg-surface-raised p-8 shadow-md lg:sticky lg:top-24"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <div className="rounded-xl border-2 border-dashed border-primary/20 bg-primary-soft/40 p-8 text-center">
              <IconTile
                icon={Bot}
                tone="brand"
                size="lg"
                className="mx-auto mb-5"
              />
              <h4 className="mb-2 text-lg font-semibold text-foreground">
                Try it live
              </h4>
              <p className="mb-6 text-sm text-foreground-muted">
                Send a sample invoice to document@cpaautomation.ai and watch it
                get processed in real-time.
              </p>
              <Button
                onClick={onGetStarted}
                className="bg-success px-6 text-success-foreground hover:bg-success/90"
              >
                Try automation now →
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
