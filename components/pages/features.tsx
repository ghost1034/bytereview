'use client'

import Link from 'next/link'
import { Check, FileText, Grid3X3, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { ShowcaseSection } from '@/components/marketing/showcase-section'
import { useAuth } from '@/contexts/AuthContext'

interface FeatureBlock {
  icon: React.ComponentType<{ className?: string }>
  tone: 'brand' | 'success' | 'warning' | 'info'
  title: string
  description: React.ReactNode
  bullets: string[]
  imageSrc: string
  imageAlt: string
  reverse?: boolean
}

const FEATURES: FeatureBlock[] = [
  {
    icon: FileText,
    tone: 'brand',
    title: 'Data extractor',
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
  },
  {
    icon: Grid3X3,
    tone: 'info',
    title: 'Table extractor',
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
    reverse: true,
  },
  {
    icon: Settings,
    tone: 'warning',
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
  },
]

export default function Features() {
  const { user } = useAuth()
  const ctaHref = user ? '/dashboard' : '/demo'
  const ctaLabel = user ? 'Go to dashboard →' : 'Try it now →'

  return (
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        title="Everything you need to extract data from any file"
        description="No complex training required — just type in plain English."
      />

      {FEATURES.map((feature, idx) => (
        <ShowcaseSection
          key={feature.title}
          surface={idx % 2 === 0 ? 'background' : 'surface-muted'}
          reverse={feature.reverse}
          title={feature.title}
          description={feature.description}
          eyebrow={
            <IconTile
              icon={feature.icon}
              tone={feature.tone}
              size="lg"
            />
          }
          features={feature.bullets.map((b) => ({ icon: Check, title: b }))}
          cta={
            <Button asChild>
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
          }
          media={
            <div className="overflow-hidden rounded-xl border border-border shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={feature.imageSrc}
                alt={feature.imageAlt}
                className="h-auto w-full"
                loading="lazy"
              />
            </div>
          }
        />
      ))}
    </>
  )
}
