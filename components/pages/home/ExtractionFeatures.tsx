'use client'

import { motion } from 'framer-motion'
import {
  Award,
  CloudUpload,
  Download,
  FileSearch,
  FileText,
  Grid3X3,
  PlayCircle,
  Settings,
} from 'lucide-react'
import { FaFileExcel, FaGoogle } from 'react-icons/fa'

import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/marketing/feature-card'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
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
    tone: 'brand' as const,
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

const FILE_TYPES: string[] = [
  'PDF',
  'DOCX',
  'XLSX',
  'PPTX',
  'TXT',
  'CSV',
  'Images',
  'Scanned Docs',
]

export default function ExtractionFeatures({
  onGetStarted,
}: ExtractionFeaturesProps) {
  return (
    <SectionShell
      id="extraction-features"
      surface="tint"
      eyebrow="Document Analysis"
      eyebrowIcon={FileSearch}
      title="Everything you need to extract data from any file"
      description="No complex training required — just type in plain English."
    >
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
          {FILE_TYPES.map((label) => (
            <motion.span
              key={label}
              variants={staggerChild}
              className="inline-flex items-center rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-accent-blue-400/40 hover:text-accent-blue-300"
            >
              {label}
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
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <div className="glass-card flex items-start gap-4 rounded-2xl p-5 transition-all duration-300 hover:border-accent-blue-400/40 hover:shadow-glow">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
          >
            <CloudUpload className="size-5" />
          </span>
          <div>
            <h4 className="mb-1 font-semibold text-foreground">
              Import from anywhere
            </h4>
            <p className="text-sm text-foreground-muted">
              <FaGoogle
                className="mr-1 inline size-3.5 text-accent-blue-300"
                aria-hidden
              />
              Google Drive, local upload, ZIP archives, or automated email
              attachments.
            </p>
          </div>
        </div>
        <div className="glass-card flex items-start gap-4 rounded-2xl p-5 transition-all duration-300 hover:border-accent-blue-400/40 hover:shadow-glow">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
          >
            <Download className="size-5" />
          </span>
          <div>
            <h4 className="mb-1 font-semibold text-foreground">
              Export everywhere
            </h4>
            <p className="text-sm text-foreground-muted">
              <FaFileExcel
                className="mr-1 inline size-3.5 text-accent-blue-300"
                aria-hidden
              />
              Excel, CSV, Google Drive auto-delivery, or direct download.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="mt-16 flex justify-center"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <div className="w-full max-w-2xl">
          <BrowserFrame label="Investment statement extract">
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
                    className="truncate rounded bg-accent-blue-400/10 p-2 text-center font-semibold text-accent-blue-300 ring-1 ring-inset ring-accent-blue-400/20"
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
                      className="truncate rounded bg-surface-muted/50 p-2 text-center text-foreground"
                    >
                      {v}
                    </div>
                  ),
                )}
              </div>
            </div>
          </BrowserFrame>
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
          <div className="glass-card overflow-hidden rounded-2xl p-1.5 shadow-glow">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-surface">
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
          <h3 className="text-2xl font-semibold tracking-tight text-foreground">
            Invoice extraction &amp; contract review
          </h3>
          <p className="text-foreground-muted">
            Extract line items from invoices and review key contract terms
            automatically. Custom fields let you pull exactly the data points
            your workflow requires.
          </p>
          <Button onClick={onGetStarted}>Try it free</Button>
        </motion.div>
      </motion.div>

      {/* Free CPE-tracker bonus — slim callout instead of a second full video block */}
      <motion.div
        className="mt-12"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20"
            >
              <Award className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-foreground">
                  CPE tracker included
                </h4>
                <span className="rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-accent-blue-300">
                  Free bonus
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground-muted">
                Automatically extract continuing-education credits from
                certificates and organize them by state requirement.
              </p>
            </div>
          </div>
          <a
            href="https://www.youtube.com/watch?v=gchB4SbxsJM"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent-blue-300 transition-colors hover:text-accent-blue-200"
          >
            <PlayCircle className="size-4" aria-hidden />
            Watch the demo
          </a>
        </div>
      </motion.div>
    </SectionShell>
  )
}
