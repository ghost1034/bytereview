'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Briefcase, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'cpaa_consulting_banner_seen_v1'

export function ConsultingBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true)
      }
    } catch {
      // localStorage unavailable — silently skip
    }
  }, [])

  function handleDismiss() {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    } catch {
      // localStorage unavailable
    }
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Forward-Deployed Consulting announcement"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40',
        'border-t border-border bg-background/95 backdrop-blur',
        'supports-[backdrop-filter]:bg-background/85',
        'shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)]',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 sm:items-center">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground ring-1 ring-inset ring-primary/10"
              aria-hidden
            >
              <Briefcase className="size-4" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                Need a custom AI build, not just a platform?
              </p>
              <p className="text-xs text-foreground-muted sm:text-sm">
                Forward-Deployed Consulting — senior engineers and operators
                who embed with your team.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <Button asChild size="sm">
              <Link href="/consulting" onClick={handleDismiss}>
                Learn more
                <ArrowRight className="ml-1 size-3.5" aria-hidden />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              aria-label="Dismiss consulting announcement"
              className="size-8"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
