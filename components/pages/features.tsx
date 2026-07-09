'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Grid3X3, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { accent, type Accent } from '@/components/pages/home/shared/tones'
import { scaleIn, viewportOnce } from '@/lib/animations'
import { useAuth } from '@/contexts/AuthContext'

interface FeatureBlock {
  icon: React.ComponentType<{ className?: string }>
  tone: Accent
  eyebrow: string
  title: string
  description: React.ReactNode
  bullets: string[]
  imageSrc: string
  imageAlt: string
  frameLabel: string
  reverse?: boolean
}

const FEATURES: FeatureBlock[] = [
  {
    icon: FileText,
    tone: 'blue',
    eyebrow: 'Extraction',
    title: 'Data extraction',
    description: (
      <>
        Intelligently extract and structure key information from any document
        type with precision. Advanced algorithms understand context and
        maintain data relationships while converting unstructured content into
        organized, actionable insights.
      </>
    ),
    bullets: [
      'Financial statements',
      'Contract documents',
      'Medical records',
      'Legal forms',
      'Research papers',
      'Technical reports',
      'Compliance documents',
    ],
    imageSrc:
      'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&w=600&h=400&fit=crop',
    imageAlt: 'Data extraction example showing invoice processing',
    frameLabel: 'Data extraction',
  },
  {
    icon: Grid3X3,
    tone: 'sky',
    eyebrow: 'Tables',
    title: 'Table extraction',
    description: (
      <>
        Advanced table recognition that captures complex layouts and preserves
        data relationships. Handles multi-column formats, nested headers, and
        irregular table structures with high accuracy.
      </>
    ),
    bullets: [
      'Multi-page reports',
      'Complex spreadsheets',
      'Financial tables',
      'Data matrices',
    ],
    imageSrc:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&w=600&h=400&fit=crop',
    imageAlt: 'Table extraction example showing spreadsheet with highlighted table',
    frameLabel: 'Table extraction',
    reverse: true,
  },
  {
    icon: Settings,
    tone: 'violet',
    eyebrow: 'Customization',
    title: 'Custom extraction at will',
    description: (
      <>
        <strong className="text-foreground">
          Create custom columns with self-defined formats and prompts.
        </strong>{' '}
        Users have the ability to classify data, add further details like
        accounting G/L codes, and create intelligent categorization rules
        tailored to their specific business needs.
      </>
    ),
    bullets: [
      'Custom data formats',
      'Classification rules',
      'Accounting codes',
      'Smart categorization',
      'Business rule automation',
    ],
    imageSrc:
      'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?ixlib=rb-4.0.3&w=600&h=400&fit=crop',
    imageAlt:
      'AI data cleaning interface showing before and after data transformation',
    frameLabel: 'Custom extraction',
  },
]

export default function Features() {
  const { user } = useAuth()
  const ctaHref = user ? '/dashboard' : '/demo'
  const ctaLabel = user ? 'Go to dashboard →' : 'Try it now →'

  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="narrow"
        eyebrow="Features"
        title={
          <>
            Everything you need to{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              extract data
            </span>{' '}
            from any file
          </>
        }
        description="No complex training required — just type in plain English."
      />

      {FEATURES.map((feature, idx) => {
        return (
          <SectionShell
            key={feature.title}
            surface={idx % 2 === 0 ? 'background' : 'surface'}
            reverse={feature.reverse}
            eyebrow={feature.eyebrow}
            eyebrowIcon={feature.icon}
            eyebrowTone={feature.tone}
            title={feature.title}
            description={feature.description}
            media={
              <motion.div
                variants={scaleIn}
                initial="hidden"
                whileInView="visible"
                viewport={viewportOnce}
              >
                <BrowserFrame label={feature.frameLabel}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={feature.imageSrc}
                    alt={feature.imageAlt}
                    className="h-auto w-full"
                    loading="lazy"
                  />
                </BrowserFrame>
              </motion.div>
            }
          >
            <FeatureList items={feature.bullets.map((b) => ({ title: b }))} tone={feature.tone} className="pt-1" />
            <div className="pt-2">
              <Button
                asChild
                className="bg-accent-blue-500 text-white hover:bg-accent-blue-600"
              >
                <Link href={ctaHref}>{ctaLabel}</Link>
              </Button>
            </div>
          </SectionShell>
        )
      })}
    </div>
  )
}
