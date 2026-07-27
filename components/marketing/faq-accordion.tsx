'use client'

import * as React from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

export interface FaqItem {
  q: React.ReactNode
  a: React.ReactNode
}

interface FaqAccordionProps {
  items: FaqItem[]
  /** Stable prefix used for trigger/content accessibility IDs. */
  idPrefix: string
  /** Visible label rendered above the list (optional). */
  className?: string
  /** Allow multiple items open at once (default: single). */
  multiple?: boolean
}

export function FaqAccordion({ items, idPrefix, className, multiple }: FaqAccordionProps) {
  return (
    <Accordion
      type={multiple ? 'multiple' : 'single'}
      collapsible={!multiple as any}
      className={cn(
        'divide-y divide-border rounded-xl border border-border bg-surface-raised',
        className,
      )}
    >
      {items.map((item, idx) => (
        <AccordionItem
          key={idx}
          value={`faq-${idx}`}
          className="border-0 px-5"
        >
          <AccordionTrigger
            id={`${idPrefix}-trigger-${idx}`}
            aria-controls={`${idPrefix}-content-${idx}`}
            className="py-4 text-left text-sm font-medium text-foreground hover:no-underline"
          >
            {item.q}
          </AccordionTrigger>
          <AccordionContent
            id={`${idPrefix}-content-${idx}`}
            aria-labelledby={`${idPrefix}-trigger-${idx}`}
            className="pb-5 text-sm text-foreground-muted"
          >
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
