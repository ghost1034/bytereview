'use client'

import { motion } from 'framer-motion'
import {
  BellRing,
  BookOpenCheck,
  Braces,
  Globe2,
  Landmark,
  MapPinned,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent } from '@/components/pages/home/shared/tones'
import { fadeInUp, viewportOnce } from '@/lib/animations'
import { cn } from '@/lib/utils'

const TONE = 'amber'
const a = accent(TONE)

const FEATURES = [
  {
    icon: MapPinned,
    text: 'Compare current and historical tax rates across jurisdictions',
  },
  {
    icon: Landmark,
    text: 'Track regulations, court decisions, and tariff measures together',
  },
  {
    icon: BookOpenCheck,
    text: 'Trace every material figure back to its primary source',
  },
  {
    icon: BellRing,
    text: 'Monitor change feeds with watchlists and delivery alerts',
  },
  {
    icon: Braces,
    text: 'Export snapshots or connect workflows through the TaxAtlas API',
  },
]

const MAP_MARKERS = [
  { left: '24%', top: '37%' },
  { left: '31%', top: '57%' },
  { left: '49%', top: '31%' },
  { left: '55%', top: '45%' },
  { left: '69%', top: '38%' },
  { left: '78%', top: '61%' },
]

function TaxAtlasPreview() {
  return (
    <BrowserFrame
      label="TaxAtlas · Global map"
      rightSlot={
        <span className="inline-flex items-center gap-1.5 text-[10px] text-foreground-subtle">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          Sources current
        </span>
      }
    >
      <div className="bg-surface-raised">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className={cn('flex size-8 items-center justify-center rounded-lg', a.chip)}>
            <Globe2 className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">Global tax map</p>
            <p className="text-[10px] text-foreground-subtle">Standard VAT · current rates</p>
          </div>
          <div className="ml-auto hidden items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-[9px] text-foreground-muted sm:flex">
            195 jurisdictions
          </div>
        </div>

        <div className="grid min-h-[310px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative overflow-hidden border-b border-border bg-[radial-gradient(circle_at_50%_45%,rgba(251,191,36,0.11),transparent_55%)] md:border-b-0 md:border-r">
            <div
              className="absolute inset-0 opacity-30"
              aria-hidden
              style={{
                backgroundImage:
                  'linear-gradient(rgba(148,163,184,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.14) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
            <svg
              viewBox="0 0 620 330"
              className="relative h-full min-h-[250px] w-full p-5"
              role="img"
              aria-label="Stylized world map with monitored jurisdictions"
            >
              <g
                fill="rgba(148, 163, 184, 0.15)"
                stroke="rgba(148, 163, 184, 0.38)"
                strokeWidth="1.5"
              >
                <path d="M42 88 82 53l64 4 27 27 45 13-22 30-36 7-15 35-26 21-26-30-30-15-18-31Z" />
                <path d="m170 187 35 19 21 48-15 54-22-9-11-43-24-31Z" />
                <path d="m270 79 31-23 52 9 15 20-20 16-19 35-31-3-21-25Z" />
                <path d="m309 143 52-18 46 24-10 56-24 55-35-11-20-47-28-20Z" />
                <path d="m364 82 54-31 84 13 67 45-35 24-49-8-27 21-43-17-28-13Z" />
                <path d="m494 231 35-28 46 18 11 39-36 23-48-13Z" />
              </g>
            </svg>
            {MAP_MARKERS.map((marker, index) => (
              <span
                key={`${marker.left}-${marker.top}`}
                className="absolute size-2.5 rounded-full border-2 border-warning-soft bg-warning shadow-[0_0_12px_hsl(var(--warning)/0.8)]"
                style={marker}
                aria-hidden
              >
                {index === 2 && (
                  <span className="absolute -inset-1.5 animate-ping rounded-full bg-warning/30" />
                )}
              </span>
            ))}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-2.5 py-2 backdrop-blur">
              <span className="size-2 rounded-full bg-warning" aria-hidden />
              <span className="text-[9px] text-foreground-muted">15–25% standard VAT</span>
            </div>
          </div>

          <div className="flex flex-col bg-surface-muted/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
                  Jurisdiction
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">Germany</p>
              </div>
              <span className="rounded-full border border-success/20 bg-success-soft px-2 py-1 text-[9px] font-medium text-success">
                Verified
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {[
                ['Standard VAT', '19%'],
                ['Reduced VAT', '7%'],
                ['Corporate tax', '15%'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-2"
                >
                  <span className="text-[10px] text-foreground-muted">{label}</span>
                  <span className="font-mono text-xs font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto border-t border-border pt-4">
              <p className="text-[10px] font-medium text-foreground">Latest change</p>
              <p className="mt-1 text-[10px] leading-relaxed text-foreground-muted">
                E-invoicing implementation timeline updated
              </p>
              <div className="mt-2 flex items-center justify-between text-[9px] text-foreground-subtle">
                <span>Primary authority</span>
                <span>2h ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

interface TaxAtlasShowcaseProps {
  onTryProduct: (destination: string) => void
}

export default function TaxAtlasShowcase({ onTryProduct }: TaxAtlasShowcaseProps) {
  return (
    <SectionShell
      id="taxatlas-showcase"
      surface="tint"
      eyebrow="Global tax intelligence"
      eyebrowIcon={Globe2}
      eyebrowTone={TONE}
      title={
        <>
          Tax change,{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            mapped and monitored
          </span>
        </>
      }
      description="TaxAtlas brings rates, regulations, court decisions, tariffs, and source-backed changes into one searchable global workspace for tax, finance, and legal teams."
      media={
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <TaxAtlasPreview />
        </motion.div>
      }
      background={
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/4 size-[520px] rounded-full bg-warning/10 blur-3xl"
        />
      }
    >
      <FeatureList
        tone={TONE}
        items={FEATURES.map(({ icon: Icon, text }) => ({
          title: (
            <span className="inline-flex items-start gap-2">
              <Icon className={cn('mt-0.5 size-4 shrink-0', a.text)} aria-hidden />
              {text}
            </span>
          ),
        }))}
      />
      <div className="pt-2">
        <Button
          size="lg"
          onClick={() => onTryProduct('/dashboard/taxatlas')}
          className="bg-accent-blue-500 px-7 text-white hover:bg-accent-blue-600"
        >
          Explore TaxAtlas
        </Button>
      </div>
    </SectionShell>
  )
}
