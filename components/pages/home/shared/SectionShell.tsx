'use client'

import * as React from 'react'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'
import { fadeInUp, staggerContainer, viewportOnce } from '@/lib/animations'
import { SectionEyebrow } from './SectionEyebrow'
import type { Accent } from './tones'

interface SectionShellProps {
  id?: string
  eyebrow?: React.ReactNode
  eyebrowIcon?: React.ComponentType<{ className?: string }>
  /** Accent hue for the eyebrow pill (and, by convention, the section's identity). */
  eyebrowTone?: Accent
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  /** Alternating navy band. */
  surface?: 'background' | 'surface' | 'surface-muted'
  align?: 'center' | 'left'
  className?: string
  /** Absolutely-positioned decorative layer (e.g. ambient 3D) behind content. */
  background?: React.ReactNode
  /** Constrain the inner content width. */
  width?: 'default' | 'narrow'
  /**
   * Right-side media (image, video, mock UI). When provided the section renders a
   * two-column split: the header + children sit in the left column beside the media.
   */
  media?: React.ReactNode
  /** In split mode, place the media on the left instead of the right. */
  reverse?: boolean
}

/**
 * The single section primitive for the homepage: consistent vertical rhythm
 * (`py-20 sm:py-28`), one locked heading scale (`text-3xl sm:text-4xl`),
 * alternating navy band, an animated eyebrow/heading block, an optional decorative
 * background slot, and an optional split-media layout. Every section file supplies
 * only its content — this keeps adjacent sections agreeing on size and spacing.
 */
export function SectionShell({
  id,
  eyebrow,
  eyebrowIcon,
  eyebrowTone,
  title,
  description,
  children,
  surface = 'background',
  align = 'center',
  className,
  background,
  width = 'default',
  media,
  reverse,
}: SectionShellProps) {
  const surfaceClass =
    surface === 'surface'
      ? 'bg-surface'
      : surface === 'surface-muted'
        ? 'bg-surface-muted'
        : 'bg-background'

  const isSplit = Boolean(media)
  // Split layouts always read left-aligned beside their media.
  const effectiveAlign = isSplit ? 'left' : align
  const hasHeader = eyebrow || title || description

  const header = hasHeader ? (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className={cn(
        'max-w-3xl space-y-4',
        !isSplit && 'mb-12 sm:mb-16',
        effectiveAlign === 'center' && 'mx-auto text-center',
      )}
    >
      {eyebrow && (
        <motion.div variants={fadeInUp}>
          <SectionEyebrow icon={eyebrowIcon} tone={eyebrowTone}>
            {eyebrow}
          </SectionEyebrow>
        </motion.div>
      )}
      {title && (
        <motion.h2
          variants={fadeInUp}
          className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        >
          {title}
        </motion.h2>
      )}
      {description && (
        <motion.p
          variants={fadeInUp}
          className="text-balance text-base leading-relaxed text-foreground-muted sm:text-lg"
        >
          {description}
        </motion.p>
      )}
    </motion.div>
  ) : null

  return (
    <section
      id={id}
      className={cn(
        'relative isolate overflow-hidden py-20 sm:py-28',
        surfaceClass,
        className,
      )}
    >
      {background}
      <div
        className={cn(
          'relative mx-auto px-4 sm:px-6 lg:px-8',
          width === 'narrow' ? 'max-w-4xl' : 'max-w-7xl',
        )}
      >
        {isSplit ? (
          <div
            className={cn(
              'grid items-center gap-10 lg:grid-cols-2 lg:gap-16',
              reverse && 'lg:[&>*:first-child]:order-2',
            )}
          >
            <div className="space-y-6">
              {header}
              {children}
            </div>
            <div className="relative">{media}</div>
          </div>
        ) : (
          <>
            {header}
            {children}
          </>
        )}
      </div>
    </section>
  )
}
