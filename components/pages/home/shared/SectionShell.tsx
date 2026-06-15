'use client'

import * as React from 'react'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'
import { fadeInUp, staggerContainer, viewportOnce } from '@/lib/animations'
import { SectionEyebrow } from './SectionEyebrow'

interface SectionShellProps {
  id?: string
  eyebrow?: React.ReactNode
  eyebrowIcon?: React.ComponentType<{ className?: string }>
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
}

/**
 * Standard dark-section wrapper for the homepage: consistent vertical rhythm,
 * max-width, alternating navy band, an animated eyebrow/heading block, and an
 * optional decorative background slot. Each section file supplies only its content.
 */
export function SectionShell({
  id,
  eyebrow,
  eyebrowIcon,
  title,
  description,
  children,
  surface = 'background',
  align = 'center',
  className,
  background,
  width = 'default',
}: SectionShellProps) {
  const surfaceClass =
    surface === 'surface'
      ? 'bg-surface'
      : surface === 'surface-muted'
        ? 'bg-surface-muted'
        : 'bg-background'

  const hasHeader = eyebrow || title || description

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
        {hasHeader && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className={cn(
              'mb-12 max-w-3xl space-y-4 sm:mb-16',
              align === 'center' && 'mx-auto text-center',
            )}
          >
            {eyebrow && (
              <motion.div variants={fadeInUp}>
                <SectionEyebrow icon={eyebrowIcon}>{eyebrow}</SectionEyebrow>
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
        )}
        {children}
      </div>
    </section>
  )
}
