/**
 * Email Automation Guide Component
 * Explains how the email-based automation system works
 */
'use client'

import { ArrowRight, CheckCircle, Mail } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/ui/section'
import { cn } from '@/lib/utils'

interface EmailAutomationGuideProps {
  className?: string
}

interface GuideStep {
  number: number
  title: string
  description: React.ReactNode
  tone?: 'brand' | 'success'
}

const STEPS: GuideStep[] = [
  {
    number: 1,
    title: 'Send email with attachments',
    description: (
      <>
        Send or forward emails with PDF attachments to{' '}
        <Badge variant="secondary" className="font-mono">
          document@cpaautomation.ai
        </Badge>
      </>
    ),
    tone: 'brand',
  },
  {
    number: 2,
    title: 'Automatic matching',
    description:
      'System matches your sender email to your account and applies your automation filters.',
    tone: 'brand',
  },
  {
    number: 3,
    title: 'Document processing',
    description:
      'Attachments are automatically processed using your configured extraction template.',
    tone: 'brand',
  },
  {
    number: 4,
    title: 'Results delivered',
    description:
      'Extracted data is automatically exported to your configured destination (Google Drive, etc.).',
    tone: 'success',
  },
]

const FILTER_EXAMPLES: Array<{ query: string; description: string }> = [
  { query: 'has:attachment', description: 'Process any email with attachments' },
  {
    query: 'subject:invoice has:attachment',
    description: 'Process emails with "invoice" in subject and attachments',
  },
  { query: 'filename:pdf', description: 'Process emails with PDF attachments' },
]

export function EmailAutomationGuide({ className }: EmailAutomationGuideProps) {
  return (
    <Section
      variant="card"
      title={
        <span className="inline-flex items-center gap-2">
          <Mail className="size-4 text-foreground-muted" aria-hidden />
          How email automations work
        </span>
      }
      description="Send emails with attachments to trigger automated document processing."
      className={className}
    >
      <div className="space-y-6">
        <ol className="space-y-3">
          {STEPS.map((step, idx) => (
            <li key={step.number} className="space-y-3">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    step.tone === 'success'
                      ? 'bg-success-soft text-success'
                      : 'bg-primary-soft text-primary-soft-foreground',
                  )}
                  aria-hidden
                >
                  {step.number}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h4 className="text-sm font-medium text-foreground">
                    {step.title}
                  </h4>
                  <div className="text-xs text-foreground-muted">
                    {step.description}
                  </div>
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="flex justify-center">
                  <ArrowRight
                    className="size-3.5 rotate-90 text-foreground-subtle"
                    aria-hidden
                  />
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-medium text-foreground">
            Email requirements
          </h4>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-xs text-foreground-muted">
              <CheckCircle className="size-3.5 text-success" aria-hidden />
              Send from the same email address as your account
            </li>
            <li className="flex items-center gap-2 text-xs text-foreground-muted">
              <CheckCircle className="size-3.5 text-success" aria-hidden />
              Include PDF attachments for processing
            </li>
            <li className="flex items-center gap-2 text-xs text-foreground-muted">
              <CheckCircle className="size-3.5 text-success" aria-hidden />
              Email content should match your automation filters
            </li>
          </ul>
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <h4 className="text-sm font-medium text-foreground">
            Example filter queries
          </h4>
          <div className="space-y-2">
            {FILTER_EXAMPLES.map((ex) => (
              <div
                key={ex.query}
                className="rounded-md border border-border bg-surface-muted p-2.5"
              >
                <code className="text-xs text-foreground">{ex.query}</code>
                <p className="mt-1 text-[11px] text-foreground-subtle">
                  {ex.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}
