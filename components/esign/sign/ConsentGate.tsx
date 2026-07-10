'use client'

import * as React from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ConsentGateProps {
  disclosureText: string
  senderEmail: string
  onAgree: () => void
  onDecline: () => void
  agreeing?: boolean
}

/**
 * Blocking ESIGN/UETA consent dialog. The document stays blurred and inert
 * behind this gate until consent is recorded — no progression before consent.
 */
export function ConsentGate({ disclosureText, senderEmail, onAgree, onDecline, agreeing }: ConsentGateProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Electronic records and signatures</h2>
            <p className="text-xs text-foreground-muted">
              {senderEmail} has asked you to sign electronically
            </p>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
            {disclosureText}
          </p>
        </ScrollArea>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onDecline} disabled={agreeing}>
            Decline to sign
          </Button>
          <Button type="button" onClick={onAgree} disabled={agreeing}>
            {agreeing && <Loader2 className="mr-2 size-4 animate-spin" />}
            I agree to use electronic records and signatures
          </Button>
        </div>
      </div>
    </div>
  )
}
