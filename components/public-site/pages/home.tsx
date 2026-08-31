'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  BrainCircuit,
  Check,
  FileStack,
  LockKeyhole,
  Network,
  Quote,
  Scale,
  Sparkles,
  Workflow,
} from 'lucide-react'

import AuthModal from '@/components/auth/AuthModal'
import { useSubscriptionPlans } from '@/hooks/useBilling'
import { PRODUCTS, PRODUCT_NAMES } from '../content'
import { DotPattern, Eyebrow, Marquee, Reveal, SectionHeading, SiteButton } from '../ui'

const CAPABILITIES = [
  {
    number: '01',
    icon: FileStack,
    title: 'Document intelligence',
    body: 'Extract, validate, transform, and route the information buried in financial and legal documents.',
    products: ['Universal Document Analysis', 'Form Fill', 'Prepared by Client'],
  },
  {
    number: '02',
    icon: BrainCircuit,
    title: 'Knowledge work',
    body: 'Draft with grounded sources, prepare signature workflows, and turn review into a repeatable system.',
    products: ['Inkwise', 'E-Signature', 'TaxAtlas'],
  },
  {
    number: '03',
    icon: Workflow,
    title: 'Practice operations',
    body: 'Coordinate projects, capture time, collect evidence, and keep every engagement moving.',
    products: ['Tasklytic', 'Chrona', 'CPE Tracker'],
  },
  {
    number: '04',
    icon: Network,
    title: 'Agents and analytics',
    body: 'Deploy digital workers and purpose-built analysis for accounting, finance, and legal teams.',
    products: ['Claw Series', 'AI Analytics Suite'],
  },
]

const STEPS = [
  ['01', 'Bring the work', 'Upload documents, connect a source, or start with a professional workflow.'],
  ['02', 'Set the standard', 'Choose the fields, rules, evidence, and review points that matter to your team.'],
  ['03', 'Let AI do the heavy lifting', 'CPAAutomation handles the extraction, drafting, coordination, or analysis.'],
  ['04', 'Review and act', 'Keep professional judgment in the loop, then export, sign, deliver, or automate.'],
]

const FAQS = [
  ['Who is CPAAutomation for?', 'Accounting, finance, and legal professionals who need reliable automation without rebuilding their practice around a generic AI tool.'],
  ['Do I need technical training?', 'No. The products follow familiar professional workflows and are designed to be useful without prompt engineering or custom development.'],
  ['Does CPAAutomation train on customer data?', 'No. Customer data is not used to train shared AI models. Security controls include encryption in transit and at rest.'],
  ['Can your team build a custom workflow?', 'Yes. Forward-Deployed Consulting embeds technical and business expertise to scope and ship custom AI software.'],
]

export default function PublicHome() {
  const [authOpen, setAuthOpen] = useState(false)
  const { data: plans } = useSubscriptionPlans()

  return (
    <>
      <section className="ps-home-hero">
        <video
          className="ps-home-hero__video"
          autoPlay
          muted
          loop
          playsInline
          poster="/public-site/hero-poster.jpg"
          aria-hidden
        >
          <source src="/public-site/hero.webm" type="video/webm" />
          <source src="/public-site/hero.mp4" type="video/mp4" />
        </video>
        <div className="ps-home-hero__shade" aria-hidden />
        <div className="ps-container ps-home-hero__content">
          <div className="ps-home-hero__eyebrow"><BadgeCheck /> Built by CPAs for professional work</div>
          <h1>Intelligent automation<br />for <span>modern professionals</span></h1>
          <p>One AI platform for the documents, decisions, and workflows that power accounting, finance, and legal teams.</p>
          <div className="ps-home-hero__actions">
            <SiteButton onClick={() => setAuthOpen(true)}>Get started free</SiteButton>
            <SiteButton href="/demo" variant="ghost">Watch the demos</SiteButton>
          </div>
          <a className="ps-home-hero__scroll" href="#platform">
            <span>Explore the platform</span><ArrowDown aria-hidden />
          </a>
        </div>
      </section>

      <Marquee items={PRODUCT_NAMES} />

      <section className="ps-section ps-section--intro" id="platform">
        <div className="ps-container">
          <Reveal className="ps-intro">
            <Eyebrow number="001">The platform</Eyebrow>
            <p>CPAAutomation brings document intelligence, professional writing, engagement operations, analytics, and AI agents into one connected platform.</p>
          </Reveal>
          <div className="ps-intro__metrics">
            <div><strong>11</strong><span>purpose-built products</span></div>
            <div><strong>3</strong><span>professional domains</span></div>
            <div><strong>1</strong><span>connected AI platform</span></div>
          </div>
        </div>
      </section>

      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          <SectionHeading
            number="002"
            eyebrow="Why CPAAutomation"
            title="Professional judgment deserves professional software."
            description="Built around the standards, evidence, and review cycles real teams already use."
          />
          <div className="ps-value-grid">
            {[
              [Scale, 'Domain-native by design', 'Workflows reflect how accountants, finance teams, and legal professionals actually review and deliver work.'],
              [LockKeyhole, 'Your data stays yours', 'Encryption, US-based infrastructure, and zero customer-data training are built into the platform.'],
              [Blocks, 'One platform, many workflows', 'Start with one painful process, then connect the rest of the engagement without adding another point solution.'],
            ].map(([Icon, title, body], index) => {
              const ValueIcon = Icon as typeof Scale
              return (
                <Reveal key={title as string} className="ps-value-card">
                  <div className="ps-value-card__top"><span><ValueIcon /></span><b>0{index + 1}</b></div>
                  <h3>{title as string}</h3><p>{body as string}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section className="ps-section" id="capabilities">
        <div className="ps-container">
          <SectionHeading number="003" eyebrow="Capabilities" title="The work is complex. The interface isn’t." />
          <div className="ps-capability-grid">
            {CAPABILITIES.map((capability) => {
              const Icon = capability.icon
              return (
                <Reveal key={capability.title} className="ps-capability-card">
                  <div className="ps-capability-card__head"><span>{capability.number}</span><Icon /></div>
                  <h3>{capability.title}</h3><p>{capability.body}</p>
                  <ul>{capability.products.map((product) => <li key={product}><Check />{product}</li>)}</ul>
                  <Link href="/features">Explore capabilities <ArrowRight /></Link>
                  <DotPattern />
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section className="ps-section ps-section--ink">
        <div className="ps-container">
          <SectionHeading number="004" eyebrow="How it works" title="From source material to finished work." />
          <div className="ps-process">
            {STEPS.map(([number, title, body]) => (
              <Reveal key={number} className="ps-process__item">
                <span>{number}</span><div><h3>{title}</h3><p>{body}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="ps-section">
        <div className="ps-container">
          <SectionHeading
            number="005"
            eyebrow="Proof in practice"
            title="See the platform doing real work."
            description="Product demonstrations and a customer result—no concept videos, no placeholder outcomes."
          />
          <div className="ps-proof-grid">
            <Reveal className="ps-proof-card ps-proof-card--feature">
              <div className="ps-video-frame">
                <iframe src="https://www.youtube-nocookie.com/embed/tNwpajJZ8zA" title="Build a P&L in two minutes" loading="lazy" allowFullScreen />
              </div>
              <span>Universal Document Analysis</span><h3>Build a P&amp;L in two minutes</h3>
              <Link href="/demo">Watch more demos <ArrowUpRight /></Link>
            </Reveal>
            <Reveal className="ps-proof-card">
              <div className="ps-proof-card__metric">95%</div>
              <span>Leonardo Family Office</span><h3>Quarterly processing reduced from three days to two hours.</h3>
              <Link href="/case-study/LFO">Read the case study <ArrowUpRight /></Link>
            </Reveal>
            <Reveal className="ps-proof-card ps-proof-card--quote">
              <Quote />
              <blockquote>“Validated our platform’s ability to handle complex technology-sector financial processes and automation workflows.”</blockquote>
              <p>Ray Sang · Finance Systems</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          <SectionHeading number="006" eyebrow="Products" title="Start with the workflow costing you the most time." />
          <div className="ps-product-list">
            {PRODUCTS.map((product, index) => {
              const Icon = product.icon
              return (
                <Link href={product.href} key={product.name} className="ps-product-row">
                  <span>{String(index + 1).padStart(2, '0')}</span><Icon />
                  <strong>{product.name}</strong><p>{product.description}</p><ArrowUpRight />
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="ps-section ps-section--ink">
        <div className="ps-container">
          <SectionHeading number="007" eyebrow="Connected work" title="Bring the tools your team already uses." description="Available integrations and export paths connect source material, review, and delivery without forcing a new system of record." />
          <div className="ps-integration-grid">{['Google Drive', 'Gmail', 'Slack', 'NetSuite', 'Microsoft Excel', 'Google Sheets'].map((name, index) => <Reveal key={name}><span>0{index + 1}</span><strong>{name}</strong><Network /></Reveal>)}</div>
        </div>
      </section>

      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          <SectionHeading number="008" eyebrow="Pricing" title="Start free. Add capacity when the workflow proves itself." />
          <div className="ps-home-pricing">{[...(plans ?? [])].sort((a, b) => a.sort_order - b.sort_order).slice(0, 3).map((plan) => <Reveal key={plan.code}><span>{plan.display_name}</span><strong>{plan.code === 'basic' ? '$9.99' : plan.code === 'pro' ? '$49.99' : 'Free'}</strong><small>{plan.code === 'free' ? 'No monthly charge' : 'per month'}</small><p>{plan.pages_included === 999999 ? 'Unlimited' : plan.pages_included.toLocaleString()} pages · {plan.tokens_included.toLocaleString()} AI tokens</p><Link href="/pricing">Compare plans <ArrowUpRight /></Link></Reveal>)}</div>
        </div>
      </section>

      <section className="ps-section">
        <div className="ps-container">
          <SectionHeading number="009" eyebrow="Common questions" title="Useful answers, before you start." />
          <div className="ps-faq-list">
            {FAQS.map(([question, answer], index) => (
              <details key={question} className="ps-faq-item">
                <summary><span>0{index + 1}</span><strong>{question}</strong><Sparkles /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectTo="/dashboard" defaultTab="signin" />
    </>
  )
}
