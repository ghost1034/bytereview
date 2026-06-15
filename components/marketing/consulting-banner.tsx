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
        'relative z-30 overflow-hidden',
        'border-b border-accent-blue-400/20 bg-surface/80 backdrop-blur',
        'supports-[backdrop-filter]:bg-surface/60',
      )}
    >
      {/* Ambient accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent-blue-400/50 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/2 size-48 -translate-y-1/2 rounded-full bg-accent-blue-500/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-inset ring-accent-blue-400/20"
              aria-hidden
            >
              <Briefcase className="size-4" />
            </span>
            <p className="min-w-0 text-sm text-foreground-muted">
              <span className="font-semibold text-foreground">
                Need a custom AI build, not just a platform?
              </span>{' '}
              <span className="hidden sm:inline">
                Forward-Deployed Consulting — senior engineers and operators
                who embed with your team.
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <Link
              href="/consulting"
              onClick={handleDismiss}
              className={cn(
                'group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-accent-blue-300 transition-colors hover:text-accent-blue-400',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              Learn more
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              aria-label="Dismiss consulting announcement"
              className="size-8 text-foreground-subtle hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
