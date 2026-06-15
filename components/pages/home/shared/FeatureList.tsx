'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { staggerChild, staggerContainer, viewportOnce } from '@/lib/animations'
import { accent, type Accent } from './tones'

interface FeatureListProps {
  items: { title: React.ReactNode }[]
  /** Accent hue for the check markers. */
  tone?: Accent
  className?: string
}

/** Tone-aware checklist used in the split product sections. */
export function FeatureList({ items, tone, className }: FeatureListProps) {
  const a = accent(tone)
  return (
    <motion.ul
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className={cn('space-y-3', className)}
    >
      {items.map((item, idx) => (
        <motion.li key={idx} variants={staggerChild} className="flex gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
              a.chip,
            )}
          >
            <Check className="size-3" />
          </span>
          <span className="text-sm text-foreground-muted">{item.title}</span>
        </motion.li>
      ))}
    </motion.ul>
  )
}
