'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  Briefcase,
  Calculator,
  Check,
  Cloud,
  Copy,
  Download,
  HardDrive,
  KeyRound,
  Monitor,
  ShieldCheck,
  Scale,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CTABanner } from '@/components/marketing/cta-banner'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { VideoCard } from '@/components/marketing/video-card'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { accent, type Accent } from '@/components/pages/home/shared/tones'
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

const CLOUD_OPTIONS = [
  'Amazon Web Services (AWS)',
  'Google Cloud Platform (GCP)',
  'Microsoft Azure',
  'Self-hosted in your VPC',
]

const MODEL_OPTIONS = [
  'Anthropic Claude',
  'OpenAI GPT',
  'Google Gemini',
  'Open-source (Llama, Mistral)',
]

const ACCOUNTINGCLAW_IMAGE =
  process.env.NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE ||
  'cpaautomation/accountingclaw-hermes:latest'

const PULL_COMMAND = `docker pull --platform linux/amd64 ${ACCOUNTINGCLAW_IMAGE}`

const RUN_COMMAND = [
  'docker run -d \\',
  '  --platform linux/amd64 \\',
  '  --name accountingclaw \\',
  '  --restart unless-stopped \\',
  '  -v ~/.accountingclaw:/opt/data \\',
  '  -e CPAA_ACTIVATION_KEY="cpaa_live_..." \\',
  '  -e OPENROUTER_API_KEY="sk-or-..." \\',
  '  -e API_SERVER_ENABLED=true \\',
  '  -e API_SERVER_HOST=0.0.0.0 \\',
  '  -e API_SERVER_KEY="change-this-api-key" \\',
  '  -p 127.0.0.1:8642:8642 \\',
  `  ${ACCOUNTINGCLAW_IMAGE} gateway run`,
].join('\n')

const NEXT_STEPS_COMMAND = [
  'docker logs -f accountingclaw',
  'docker exec -it accountingclaw hermes status',
  'docker exec -it accountingclaw hermes skills list',
  'docker exec -it accountingclaw hermes chat',
].join('\n')

const HERMES_ALIAS_COMMAND =
  "alias hermes='docker exec -it accountingclaw hermes'"

const HERMES_DESKTOP_DOWNLOADS = {
  mac: 'https://hermes-assets.nousresearch.com/Hermes-Setup.dmg',
  windows: 'https://hermes-assets.nousresearch.com/Hermes-Setup.exe',
}

const HERMES_LINUX_INSTALL_COMMAND =
  'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'

const DESKTOP_INSTALL_BASH_COMMAND =
  'curl -fsSL https://cpaautomation.ai/install-accountingclaw.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash'

const DESKTOP_INSTALL_PS_COMMAND =
  '$env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/install-accountingclaw.ps1 -UseBasicParsing | iex'

const DESKTOP_NOTES = [
  {
    icon: Monitor,
    title: 'Official Hermes Desktop app',
    detail:
      'Runs on the native Hermes Desktop app for macOS, Windows, and Linux — same agent, chat UI included.',
  },
  {
    icon: KeyRound,
    title: 'Activation key required',
    detail:
      'The installer downloads the AccountingClaw skills only with a valid personal CPAA_ACTIVATION_KEY. Get your key from the Activation page.',
  },
  {
    icon: HardDrive,
    title: 'Local agent data',
    detail:
      'Skills, sessions, and config live in your Hermes home (~/.hermes on macOS/Linux, %LOCALAPPDATA%\\hermes on Windows).',
  },
  {
    icon: BrainCircuit,
    title: 'Model configured in-app',
    detail:
      'Hermes Desktop walks you through connecting your AI model provider during onboarding — no env vars needed.',
  },
]

const DOWNLOAD_NOTES = [
  {
    icon: ShieldCheck,
    title: 'Encrypted skills included',
    detail: 'AccountingClaw skills ship inside the public linux/amd64 image as an encrypted bundle.',
  },
  {
    icon: KeyRound,
    title: 'Activation key required',
    detail: 'The encrypted AccountingClaw profile installs only when your personal CPAA_ACTIVATION_KEY is provided. Get your key from the Activation page.',
  },
  {
    icon: HardDrive,
    title: 'Persistent agent data',
    detail: 'Hermes profile data, sessions, and installed skills live in the mounted /opt/data volume.',
  },
  {
    icon: Cloud,
    title: 'OpenRouter key required',
    detail: 'Hermes uses OpenRouter by default, so pass OPENROUTER_API_KEY with your model access key.',
  },
]

const SKILL_PACKAGES: Array<{
  icon: React.ComponentType<{ className?: string }>
  name: string
  detail: string
}> = [
  {
    icon: Calculator,
    name: 'AccountingClaw',
    detail: 'Bank reconciliations, journal entries, month-end close',
  },
  {
    icon: Briefcase,
    name: 'FinanceClaw',
    detail: 'FP&A automations, flux analysis, reporting packs',
  },
  {
    icon: Scale,
    name: 'LegalClaw',
    detail: 'Contract clause review, redlines, compliance checks',
  },
]

const SETUP_CARDS: Array<{
  icon: React.ComponentType<{ className?: string }>
  tone: Accent
  title: string
  description: string
}> = [
  {
    icon: Cloud,
    tone: 'sky',
    title: 'Cloud provider',
    description:
      'Run Claw on the cloud you already use, or keep everything inside your own VPC.',
  },
  {
    icon: BrainCircuit,
    tone: 'violet',
    title: 'AI model',
    description:
      'Pick the foundation model that fits your accuracy, latency, and data-residency requirements.',
  },
  {
    icon: Bot,
    tone: 'amber',
    title: 'Skill packages',
    description:
      'Deploy one Claw or all three. Each comes with hundreds of domain-specific skills out of the box.',
  },
]

function VideoStack() {
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

interface CommandCardProps {
  title: string
  description: string
  command: string
}

function CommandCard({ title, description, command }: CommandCardProps) {
  const [copied, setCopied] = useState(false)

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-foreground-muted">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-border-strong"
          onClick={copyCommand}
        >
          {copied ? (
            <Check className="size-4 text-success" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-words bg-surface px-4 py-4 text-xs leading-6 text-foreground sm:px-5">
        <code>{command}</code>
      </pre>
    </div>
  )
}

function NotesGrid({
  notes,
}: {
  notes: Array<{
    icon: React.ComponentType<{ className?: string }>
    title: string
    detail: string
  }>
}) {
  const a = accent('blue')
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {notes.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.title}
            className="glass-card flex gap-3 rounded-xl p-3"
          >
            <span
              aria-hidden
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-lg',
                a.chip,
              )}
            >
              <Icon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-foreground-muted">
                {item.detail}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CloudWorkersTab() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
              Run AccountingClaw in your cloud with Docker
            </h3>
            <p className="text-balance text-base text-foreground-muted">
              Pull the verified AccountingClaw Docker image and run it with
              your personal CPAAutomation.ai activation key plus your
              OpenRouter key. The image includes AccountingClaw skills
              encrypted inside the container and installs them into your
              persistent Hermes data volume on first startup. Ideal for AWS,
              GCP, Azure, or your own VPC.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-accent-blue-500 text-white hover:bg-accent-blue-600">
              <Link href="/dashboard/activation">
                Get your activation key
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-border-strong">
              <Link href="/contact">Contact us for a code</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <CommandCard
            title="Pull the image"
            description="Use the public AccountingClaw Hermes image. The platform flag supports Apple Silicon and other ARM hosts via Docker emulation."
            command={PULL_COMMAND}
          />
          <CommandCard
            title="Run locally or on your server"
            description="Mount /opt/data so Hermes sessions and installed skills persist across container restarts. The API server is bound to localhost."
            command={RUN_COMMAND}
          />
          <CommandCard
            title="Use Hermes after it starts"
            description="The hermes command runs inside the container. Use docker exec to verify the install, list skills, and open chat."
            command={NEXT_STEPS_COMMAND}
          />
          <CommandCard
            title="Optional host shortcut"
            description="Add this shell alias if you want to type hermes from your host terminal while the container is running."
            command={HERMES_ALIAS_COMMAND}
          />
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-4 text-sm leading-6 text-primary-soft-foreground">
        <p className="font-semibold">What to do next</p>
        <p className="mt-1">
          After the container starts, run the commands above. If your terminal
          says{' '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            hermes: command not found
          </code>{', '}
          run Hermes through{' '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            docker exec
          </code>{' '}
          or add the alias. The local API is available on{' '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            http://127.0.0.1:8642
          </code>{' '}
          only when{' '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            API_SERVER_ENABLED
          </code>{', '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            API_SERVER_HOST
          </code>{', and '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            API_SERVER_KEY
          </code>{' '}
          are set.
        </p>
      </div>

      <NotesGrid notes={DOWNLOAD_NOTES} />
    </div>
  )
}

function DesktopWorkersTab() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
              Run AccountingClaw on your desktop
            </h3>
            <p className="text-balance text-base text-foreground-muted">
              Install the official Hermes Desktop app, then add the
              AccountingClaw skills with one command and your personal
              activation key. Everything runs locally on your machine — no
              Docker required.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-accent-blue-500 text-white hover:bg-accent-blue-600">
              <a href={HERMES_DESKTOP_DOWNLOADS.mac}>
                <Download className="mr-2 size-4" aria-hidden />
                Hermes Desktop for Mac
              </a>
            </Button>
            <Button asChild className="bg-accent-blue-500 text-white hover:bg-accent-blue-600">
              <a href={HERMES_DESKTOP_DOWNLOADS.windows}>
                <Download className="mr-2 size-4" aria-hidden />
                Hermes Desktop for Windows
              </a>
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="border-border-strong">
              <Link href="/dashboard/activation">
                Get your activation key
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-border-strong">
              <Link href="/contact">Contact us for a code</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <CommandCard
            title="1. Install Hermes Desktop"
            description="Download the app for Mac or Windows with the buttons on the left. On Linux, install Hermes with the official terminal one-liner."
            command={HERMES_LINUX_INSTALL_COMMAND}
          />
          <CommandCard
            title="2. Install AccountingClaw (macOS / Linux)"
            description="Replace cpaa_live_... with your personal activation key from the Activation page. The installer verifies and installs the skills into your local Hermes home."
            command={DESKTOP_INSTALL_BASH_COMMAND}
          />
          <CommandCard
            title="2. Install AccountingClaw (Windows PowerShell)"
            description="Replace cpaa_live_... with your personal activation key from the Activation page, then run in PowerShell."
            command={DESKTOP_INSTALL_PS_COMMAND}
          />
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-4 text-sm leading-6 text-primary-soft-foreground">
        <p className="font-semibold">What to do next</p>
        <p className="mt-1">
          Launch Hermes Desktop and complete its onboarding (it connects your
          AI model provider in-app). Then open the Skills pane — the
          AccountingClaw skills are ready to use. CLI check:{' '}
          <code className="rounded bg-background/70 px-1 py-0.5">
            hermes skills list
          </code>
          .
        </p>
      </div>

      <NotesGrid notes={DESKTOP_NOTES} />
    </div>
  )
}

function InstallationOptions() {
  return (
    <SectionShell
      id="install-options"
      surface="background"
      eyebrow="Installation options"
      eyebrowIcon={Download}
      eyebrowTone="blue"
      title="Deploy your digital workers — cloud or desktop"
      description="Run AccountingClaw as a cloud digital worker with Docker, or as a desktop digital worker on the Hermes Desktop app. Both unlock the same skills with your personal activation key."
    >
      <Tabs defaultValue="cloud" className="space-y-6">
        <TabsList className="mx-auto grid h-auto w-full max-w-xl grid-cols-2">
          <TabsTrigger value="cloud" className="gap-2 py-2.5">
            <Cloud className="size-4" aria-hidden />
            Cloud digital workers
          </TabsTrigger>
          <TabsTrigger value="desktop" className="gap-2 py-2.5">
            <Monitor className="size-4" aria-hidden />
            Desktop digital workers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cloud">
          <CloudWorkersTab />
        </TabsContent>
        <TabsContent value="desktop">
          <DesktopWorkersTab />
        </TabsContent>
      </Tabs>
    </SectionShell>
  )
}

export default function Claw() {
  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="wide"
        eyebrow={
          <>
            <Bot className="size-3.5" aria-hidden />
            Now available · personalized setup
          </>
        }
        title={
          <>
            Claw Series — digital workers, deployed{' '}
            <span className="bg-gradient-to-r from-marketing-hero-accent to-marketing-hero-foreground bg-clip-text text-transparent">
              your way
            </span>
          </>
        }
        description="AccountingClaw, FinanceClaw, and LegalClaw run hundreds of pre-built skills autonomously, with guardrails built for accounting, finance, and legal workflows. Deploy in your cloud or on your desktop, pick the model and skills — or let us configure everything for you."
        ctas={
          <>
            <Button
              asChild
              size="lg"
              className="btn-shimmer w-full bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600 sm:w-auto"
            >
              <Link href="/contact">
                Contact us to get started
                <ArrowRight className="ml-2 size-5" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="w-full border border-marketing-hero-border bg-transparent px-8 text-marketing-hero-foreground hover:bg-marketing-hero-foreground/10 hover:text-marketing-hero-foreground sm:w-auto"
            >
              <a href="#install-options">
                Install AccountingClaw
                <Download className="ml-2 size-5" aria-hidden />
              </a>
            </Button>
          </>
        }
      />

      <InstallationOptions />

      {/* Claw Series overview */}
      <SectionShell
        surface="surface"
        eyebrow="Claw Series"
        eyebrowIcon={Bot}
        eyebrowTone="amber"
        title={
          <>
            Autonomous{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('amber').gradient,
              )}
            >
              digital workers
            </span>{' '}
            for accounting, finance &amp; legal
          </>
        }
        description="Not just tools you operate — digital workers you deploy. Each Claw runs hundreds of pre-built skills end-to-end, with guardrails designed for regulated environments."
        media={<VideoStack />}
      >
        <FeatureList items={CAPABILITIES} tone="amber" className="pt-1" />
      </SectionShell>

      {/* Personalized setup */}
      <SectionShell
        id="setup-options"
        surface="surface-muted"
        eyebrow="Personalized setup"
        eyebrowIcon={Sparkles}
        eyebrowTone="violet"
        title="Choose your stack, or let us choose it for you"
        description="Tell us your preferences and we'll deploy AccountingClaw, FinanceClaw, and LegalClaw on the infrastructure and models you already trust."
      >
        <motion.div
          className="grid grid-cols-1 gap-5 md:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {SETUP_CARDS.map((card) => {
            const Icon = card.icon
            const a = accent(card.tone)
            const options =
              card.title === 'Cloud provider' ? CLOUD_OPTIONS : MODEL_OPTIONS
            return (
              <motion.div key={card.title} variants={staggerChild}>
                <GlassCard
                  className={cn(
                    'h-full space-y-4 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow',
                    a.hoverBorder,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-11 items-center justify-center rounded-xl',
                        a.chip,
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">
                      {card.title}
                    </h3>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    {card.description}
                  </p>
                  {card.title === 'Skill packages' ? (
                    <ul className="space-y-3">
                      {SKILL_PACKAGES.map((pkg) => {
                        const PkgIcon = pkg.icon
                        return (
                          <li
                            key={pkg.name}
                            className="flex items-start gap-2 text-sm"
                          >
                            <PkgIcon
                              className={cn('mt-0.5 size-4 shrink-0', a.text)}
                              aria-hidden
                            />
                            <div>
                              <p className="font-medium text-foreground">
                                {pkg.name}
                              </p>
                              <p className="text-xs text-foreground-muted">
                                {pkg.detail}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-2">
                      {options.map((option) => (
                        <li
                          key={option}
                          className="flex items-start gap-2 text-sm text-foreground-muted"
                        >
                          <span
                            className={cn(
                              'mt-1.5 size-1.5 shrink-0 rounded-full',
                              a.dot,
                            )}
                            aria-hidden
                          />
                          {option}
                        </li>
                      ))}
                    </ul>
                  )}
                </GlassCard>
              </motion.div>
            )
          })}
        </motion.div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-foreground-muted">
          Don&apos;t see your preferred provider or model? Tell us in your
          message — we can usually accommodate.
        </p>
      </SectionShell>

      {/* White-glove */}
      <SectionShell surface="background" width="narrow">
        <motion.div
          variants={staggerChild}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <GlassCard glow className="p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-11 items-center justify-center rounded-xl',
                  accent('blue').chip,
                )}
              >
                <BookOpen className="size-5" />
              </span>
              <h2 className="text-xl font-semibold text-foreground">
                Prefer white-glove setup?
              </h2>
            </div>
            <p className="mt-4 text-foreground-muted">
              We&apos;ll pick the cloud, model, and skill mix based on your
              firm&apos;s size, compliance needs, and budget — then deploy,
              train your team, and stay on for ongoing tuning.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                asChild
                className="bg-accent-blue-500 text-white hover:bg-accent-blue-600"
              >
                <Link href="/contact">Talk to our team</Link>
              </Button>
              <Button asChild variant="outline" className="border-border-strong">
                <Link href="/demo">View demo videos</Link>
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </SectionShell>

      <CTABanner
        tone="gradient"
        eyebrow="Ready when you are"
        title="Deploy your first Claw in days, not months"
        description="Reach out and we'll scope a setup tailored to your firm — including pricing, security review, and a deployment timeline."
        primary={
          <Button
            asChild
            size="lg"
            className="btn-shimmer w-full bg-accent-blue-500 px-8 font-semibold text-white hover:bg-accent-blue-600 sm:w-auto"
          >
            <Link href="/contact">
              Contact us
              <ArrowRight className="ml-2 size-5" aria-hidden />
            </Link>
          </Button>
        }
        secondary={
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="w-full border border-marketing-hero-border bg-transparent px-8 text-marketing-hero-foreground hover:bg-marketing-hero-foreground/10 hover:text-marketing-hero-foreground sm:w-auto"
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
        }
      />
    </div>
  )
}
