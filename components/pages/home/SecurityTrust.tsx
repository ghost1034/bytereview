'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Ban, Check, Lock, MapPinCheck, Shield, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import {
  fadeInUp,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const BADGES = [
  {
    icon: Shield,
    label: 'TLS 1.3 encryption',
    detail: 'All data transfers use the latest encryption protocols',
  },
  {
    icon: MapPinCheck,
    label: 'US-only hosting',
    detail: 'Google Cloud US regions with SOC 2 compliance',
  },
  {
    icon: Lock,
    label: 'AES-256 at rest',
    detail: 'Military-grade encryption for stored data',
  },
  {
    icon: Ban,
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
    <SectionShell
      surface="background"
      width="narrow"
      eyebrow="Security & compliance"
      eyebrowIcon={ShieldCheck}
      title="Enterprise-grade security"
      description="Your data security is our top priority. Built for the standards professional services demand."
    >
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        {BADGES.map((b) => (
          <motion.div key={b.label} variants={staggerChild}>
            <GlassCard className="h-full p-6 text-center transition-colors hover:border-accent-blue-400/40">
              <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 text-accent-blue-300 shadow-glow">
                <b.icon className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">{b.label}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">
                {b.detail}
              </p>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="mt-6"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <GlassCard className="p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMPLIANCE.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-full border border-border bg-surface-muted/50 px-4 py-2 text-sm text-foreground-muted"
              >
                <Check className="size-4 shrink-0 text-accent-blue-400" aria-hidden />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      <motion.div
        className="mt-10 text-center"
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
    </SectionShell>
  )
}
