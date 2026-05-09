'use client'

import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ShowcaseSection } from '@/components/marketing/showcase-section'
import { VideoCard } from '@/components/marketing/video-card'
import {
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

const CAPABILITIES = [
  { title: 'Automated bank reconciliations' },
  { title: 'Contract clause extraction and review' },
  { title: 'Tax form preparation and validation' },
  { title: 'Regulatory compliance checks' },
]

const VIDEOS = [
  {
    src: 'https://www.youtube-nocookie.com/embed/976yIJsO1cA?si=82I14R9fUPznZX1E',
    title: 'AccountingClaw Preview',
  },
  {
    src: 'https://www.youtube-nocookie.com/embed/hePBTs8MnFQ?si=exJDcDO07KvjXkb4',
    title: 'Dual Agent Technical Accounting Memo',
  },
  {
    src: 'https://www.youtube-nocookie.com/embed/939uCq5jxN0?si=77c9Gr7DVJiHKlnx',
    title: 'AI Skill for Browser Automation',
  },
]

function ClawMedia() {
  return (
    <motion.div
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      {VIDEOS.map((video) => (
        <motion.div key={video.src} variants={staggerChild}>
          <VideoCard src={video.src} title={video.title} />
        </motion.div>
      ))}
    </motion.div>
  )
}

export default function ClawShowcase() {
  return (
    <ShowcaseSection
      surface="background"
      eyebrow={
        <Badge
          variant="outline"
          className="rounded-full border-success/20 bg-success-soft text-success"
        >
          <Bot className="mr-1.5 size-3" aria-hidden />
          Coming soon
        </Badge>
      }
      title={
        <>
          Claw Series:{' '}
          <span className="bg-gradient-to-r from-success to-primary bg-clip-text text-transparent">
            digital workers
          </span>{' '}
          for accounting, finance &amp; legal
        </>
      }
      description="AccountingClaw, FinanceClaw, and LegalClaw are AI agents that work autonomously — not just tools you operate, but digital workers you deploy. Hundreds of pre-built skills with guardrails designed for regulated environments."
      features={CAPABILITIES}
      cta={
        <p className="text-sm text-foreground-muted">One-click setup.</p>
      }
      media={<ClawMedia />}
    />
  )
}
