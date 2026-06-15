'use client'

import { motion } from 'framer-motion'
import { Bot, FolderOutput, Mail, Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/marketing/code-block'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { fadeInUp, viewportOnce } from '@/lib/animations'

interface AutomationFlowProps {
  onGetStarted: () => void
}

const STEPS = [
  {
    number: 1,
    icon: Mail,
    title: 'Forward or send emails to document@cpaautomation.ai',
    description:
      'Any email with PDF attachments automatically triggers processing.',
  },
  {
    number: 2,
    icon: Bot,
    title: 'AI extracts data using your templates',
    description: "Custom fields, prompts, and rules you've configured.",
  },
  {
    number: 3,
    icon: FolderOutput,
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
    <SectionShell
      surface="transparent"
      eyebrow="Automations"
      eyebrowIcon={Zap}
      title="Set it and forget it"
      description="Email attachments → AI extraction → automated delivery. Zero manual work."
    >
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <ol className="space-y-1">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              return (
                <li key={step.number}>
                  <div className="glass-card flex items-start gap-4 rounded-2xl p-5 transition-all duration-300 hover:border-accent-blue-400/40 hover:shadow-glow">
                    <span
                      aria-hidden
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="pt-0.5">
                      <h4 className="font-semibold text-foreground">
                        <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-accent-blue-500 text-xs font-semibold text-white">
                          {step.number}
                        </span>
                        {step.title}
                      </h4>
                      <p className="mt-1 text-sm text-foreground-muted">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="my-0 ml-9 flex justify-start">
                      <div className="h-6 w-px border-l-2 border-dashed border-accent-blue-400/30" />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="glass-card mt-6 rounded-2xl p-5">
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
          </div>
        </motion.div>

        <motion.div
          className="glass-card rounded-2xl p-8 shadow-glow lg:sticky lg:top-24"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="rounded-xl border-2 border-dashed border-accent-blue-400/30 bg-accent-blue-400/5 p-8 text-center">
            <span
              aria-hidden
              className="mx-auto mb-5 inline-flex size-12 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
            >
              <Bot className="size-6" />
            </span>
            <h4 className="mb-2 text-lg font-semibold text-foreground">
              Try it live
            </h4>
            <p className="mb-6 text-sm text-foreground-muted">
              Send a sample invoice to document@cpaautomation.ai and watch it
              get processed in real-time.
            </p>
            <Button onClick={onGetStarted} className="px-6">
              Try automation now
            </Button>
          </div>
        </motion.div>
      </div>
    </SectionShell>
  )
}
