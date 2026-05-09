'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  CloudUpload,
  Download,
  FileText,
  Grid3X3,
  Settings,
} from 'lucide-react'
import { FaFileExcel, FaGoogle } from 'react-icons/fa'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/marketing/feature-card'
import { IconTile } from '@/components/ui/icon-tile'
import {
  fadeInUp,
  hoverLift,
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'

interface ExtractionFeaturesProps {
  onGetStarted: () => void
}

const FEATURES = [
  {
    icon: FileText,
    tone: 'brand' as const,
    title: 'Data Extractor',
    description:
      'Intelligently extract and structure key information from any document type with precision.',
    bullets: [
      'Financial statements',
      'Contract documents',
      'Medical records',
      'Legal forms',
    ],
  },
  {
    icon: Grid3X3,
    tone: 'brand' as const,
    title: 'Table Extractor',
    description:
      'Advanced table recognition that captures complex layouts and preserves data relationships.',
    bullets: [
      'Multi-page reports',
      'Complex spreadsheets',
      'Financial tables',
      'Data matrices',
    ],
  },
  {
    icon: Settings,
    tone: 'warning' as const,
    title: 'Custom Extraction',
    description:
      'Create custom columns with self-defined formats and prompts. Classify data and add details like G/L codes.',
    bullets: [
      'Custom data formats',
      'Classification rules',
      'Accounting codes',
      'Smart categorization',
    ],
  },
]

const FILE_TYPES: Array<{
  label: string
  variant: 'default' | 'secondary' | 'outline'
}> = [
  { label: 'PDF', variant: 'secondary' },
  { label: 'DOCX', variant: 'secondary' },
  { label: 'XLSX', variant: 'secondary' },
  { label: 'PPTX', variant: 'secondary' },
  { label: 'TXT', variant: 'secondary' },
  { label: 'CSV', variant: 'secondary' },
  { label: 'Images', variant: 'secondary' },
  { label: 'Scanned Docs', variant: 'secondary' },
]

export default function ExtractionFeatures({
  onGetStarted,
}: ExtractionFeaturesProps) {
  return (
    <section
      id="extraction-features"
      className="bg-surface-muted py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-14 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Badge
            variant="secondary"
            className="mb-4 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
          >
            Document Analysis
          </Badge>
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Everything you need to extract data from any file
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-foreground-muted">
            No complex training required — just type in plain English.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={staggerChild}
              {...hoverLift}
              className="h-full"
            >
              <FeatureCard
                icon={feature.icon}
                tone={feature.tone}
                title={feature.title}
                description={feature.description}
                bullets={feature.bullets}
                cta={{ label: 'Learn more', href: '/features' }}
                className="h-full"
              />
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="mt-16 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h3 className="mb-5 text-base font-semibold text-foreground">
            Supports all document types
          </h3>
          <motion.div
            className="mb-3 flex flex-wrap justify-center gap-2"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {FILE_TYPES.map((ft) => (
              <motion.span key={ft.label} variants={staggerChild}>
                <Badge variant={ft.variant} className="text-xs font-medium">
                  {ft.label}
                </Badge>
              </motion.span>
            ))}
          </motion.div>
          <p className="text-sm text-foreground-muted">
            Even handles complex multi-page reports, scanned documents, and
            mixed layouts
          </p>
        </motion.div>

        <motion.div
          className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div
            variants={staggerChild}
            className="flex items-start gap-4 rounded-xl border border-border bg-surface-raised p-5 shadow-xs"
          >
            <IconTile icon={CloudUpload} tone="success" size="md" />
            <div>
              <h4 className="mb-1 font-semibold text-foreground">
                Import from anywhere
              </h4>
              <p className="text-sm text-foreground-muted">
                <FaGoogle className="mr-1 inline size-3.5 text-info" aria-hidden />
                Google Drive, local upload, ZIP archives, or automated email
                attachments.
              </p>
            </div>
          </motion.div>
          <motion.div
            variants={staggerChild}
            className="flex items-start gap-4 rounded-xl border border-border bg-surface-raised p-5 shadow-xs"
          >
            <IconTile icon={Download} tone="brand" size="md" />
            <div>
              <h4 className="mb-1 font-semibold text-foreground">
                Export everywhere
              </h4>
              <p className="text-sm text-foreground-muted">
                <FaFileExcel className="mr-1 inline size-3.5 text-success" aria-hidden />
                Excel, CSV, Google Drive auto-delivery, or direct download.
              </p>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className="mt-16 flex justify-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="w-full max-w-2xl">
            <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-md">
              <div className="flex items-center gap-1.5 border-b border-border bg-surface-muted px-4 py-2.5">
                <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
                <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
                <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
                <span className="ml-2 text-xs text-foreground-subtle">
                  Investment statement extract
                </span>
              </div>
              <div className="overflow-x-auto p-4">
                <div className="grid min-w-[480px] grid-cols-6 gap-1.5 text-xs">
                  {[
                    'Portfolio Co.',
                    'Quarter',
                    'Revenue',
                    'EBITDA',
                    'Growth %',
                    'Valuation',
                  ].map((h) => (
                    <div
                      key={h}
                      className="truncate rounded bg-primary-soft p-2 text-center font-semibold text-primary-soft-foreground"
                    >
                      {h}
                    </div>
                  ))}
                  {['TechFlow Inc', 'Q4 2024', '$12.5M', '$3.2M', '23%', '$85M'].map(
                    (v, i) => (
                      <div
                        key={`r1-${i}`}
                        className="truncate p-2 text-center text-foreground"
                      >
                        {v}
                      </div>
                    ),
                  )}
                  {['DataMind Corp', 'Q4 2024', '$8.7M', '$1.9M', '31%', '$62M'].map(
                    (v, i) => (
                      <div
                        key={`r2-${i}`}
                        className="truncate bg-surface-muted/50 p-2 text-center text-foreground"
                      >
                        {v}
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="mt-16 grid grid-cols-1 items-center gap-10 lg:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <h3 className="mb-3 text-lg font-semibold text-foreground">
              See it in action
            </h3>
            <div className="overflow-hidden rounded-xl border border-border shadow-md">
              <div className="relative aspect-video bg-marketing-hero-from">
                <iframe
                  className="absolute inset-0 h-full w-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/uWA5ds9VuPM?si=DxjCBqrxZ997eF5A"
                  title="Invoice Extraction and Contract Review"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </motion.div>
          <motion.div variants={staggerChild} className="space-y-4">
            <Badge
              variant="secondary"
              className="rounded-full bg-primary-soft px-3 py-1 text-xs text-primary-soft-foreground"
            >
              See it in action
            </Badge>
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              Invoice extraction &amp; contract review
            </h3>
            <p className="text-foreground-muted">
              Extract line items from invoices and review key contract terms
              automatically. Custom fields let you pull exactly the data points
              your workflow requires.
            </p>
            <Button onClick={onGetStarted}>Try it free →</Button>
          </motion.div>
        </motion.div>

        <motion.div
          className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <h3 className="mb-3 text-lg font-semibold text-foreground">
              See a free bonus
            </h3>
            <div className="overflow-hidden rounded-xl border border-border shadow-md">
              <div className="relative aspect-video bg-marketing-hero-from">
                <iframe
                  className="absolute inset-0 h-full w-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/gchB4SbxsJM?si=KlJMFOjH0nKP08yX"
                  title="Free CPE Tracker"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </motion.div>
          <motion.div variants={staggerChild} className="space-y-4">
            <Badge
              variant="outline"
              className="rounded-full border-success/20 bg-success-soft px-3 py-1 text-xs text-success"
            >
              Free bonus
            </Badge>
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              CPE tracker included
            </h3>
            <p className="text-foreground-muted">
              Automatically extract continuing education credits from
              certificates. Upload your CPE documents and let AI organize your
              credits by state requirements.
            </p>
            <Button onClick={onGetStarted}>Try it free →</Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
