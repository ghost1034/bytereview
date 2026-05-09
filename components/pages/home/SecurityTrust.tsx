'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Ban, Check, Lock, MapPinCheck, Shield } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const BADGES = [
  {
    icon: Shield,
    tone: 'brand' as const,
    label: 'TLS 1.3 encryption',
    detail: 'All data transfers use the latest encryption protocols',
  },
  {
    icon: MapPinCheck,
    tone: 'brand' as const,
    label: 'US-only hosting',
    detail: 'Google Cloud US regions with SOC 2 compliance',
  },
  {
    icon: Lock,
    tone: 'brand' as const,
    label: 'AES-256 at rest',
    detail: 'Military-grade encryption for stored data',
  },
  {
    icon: Ban,
    tone: 'brand' as const,
    label: 'Zero data training',
    detail: 'Your documents never train AI models',
  },
]

const COMPLIANCE = [
  'GDPR compliant',
  'CCPA compliant',
  'Automatic data deletion after processing',
  'Meets CPA firm security requirements',
  'Legal industry standards',
  'Full audit logs for all activities',
]

export default function SecurityTrust() {
  return (
    <section className="bg-surface-muted py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-12 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Badge
            variant="secondary"
            className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
          >
            Security &amp; compliance
          </Badge>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Enterprise-grade security
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-foreground-muted">
            Your data security is our top priority. Built for the standards
            professional services demand.
          </p>
        </motion.div>

        <motion.div
          className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {BADGES.map((b) => (
            <motion.div
              key={b.label}
              className="rounded-xl border border-border bg-surface-raised p-5 text-center shadow-xs"
              variants={staggerChild}
            >
              <IconTile icon={b.icon} tone={b.tone} size="lg" className="mx-auto mb-3 rounded-full" />
              <p className="text-sm font-semibold text-foreground">{b.label}</p>
              <p className="mt-1 text-xs text-foreground-muted">{b.detail}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="mb-8 rounded-xl border border-border bg-surface-raised p-6 shadow-xs"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMPLIANCE.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-sm text-foreground-muted"
              >
                <Check className="size-4 shrink-0 text-success" aria-hidden />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <p className="mb-4 text-sm text-foreground-muted">
            Need enterprise security documentation or custom compliance
            requirements?
          </p>
          <Button asChild variant="outline">
            <Link href="/contact">Contact security team →</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
