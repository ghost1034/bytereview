import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  Clock3,
  Code2,
  FileSearch2,
  Handshake,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from 'lucide-react'

import { PageHero, Reveal, SectionHeading, SiteButton } from '../ui'

const DEMO_GROUPS = [
  {
    name: 'Document intelligence',
    description: 'Extraction, analysis, and automated document work.',
    videos: [
      ['Build P&L in 2 Minutes', 'tNwpajJZ8zA'],
      ['Free CPE Tracker', 'gchB4SbxsJM'],
      ['Bank Statement Analysis', 'mxDEliIRWtc'],
      ['Invoice Extraction and Contract Review', 'uWA5ds9VuPM'],
      ['Email and Google Drive Automations', 'R0ubnn4ggGA'],
    ],
  },
  {
    name: 'Writing and forms',
    description: 'Grounded drafting, citations, and form completion.',
    videos: [
      ['Automatically Fill Any PDF or Word Document with AI', 'Jgv9cP-vT1Y'],
      ['Write a Professional Investor Report in Minutes with AI', 'OaloCO7Bh28'],
      ['Write a Legal Complaint Faster with AI', 'pNpDUlNZuuU'],
      ['Write a Robust Academic Article with 70+ References Using AI', 'qmFBxibcals'],
      ['Generate Accurate Academic & Legal Citations with AI', 'zloKYPE0Vjw'],
      ['How Inkwise Prevents AI Hallucinations with RAG', 'e5rytCGzzec'],
    ],
  },
  {
    name: 'Signatures, time, and agents',
    description: 'Operational workflows that keep professional work moving.',
    videos: [
      ['Send & Sign PDFs for Free with CPAAutomation eSign', 'QnpKCSrOGB8'],
      ['Track Billable Hours Automatically with AI', 'QNCVh1SKS9A'],
      ['AccountingClaw Preview', '976yIJsO1cA'],
      ['Dual Agent Technical Accounting Memo', 'hePBTs8MnFQ'],
      ['AI Skill for Browser Automation', '939uCq5jxN0'],
      ['Automate Universal Document Analysis with AccountingClaw', 'w4HB7m8XEUQ'],
      ['Get Your AI Digital Workers on Slack', 'bnB6fy3KaA4'],
    ],
  },
]

export function PublicDemo() {
  return (
    <>
      <PageHero
        eyebrow="Product demonstrations"
        title={<>The platform, <span className="ps-gradient-text">doing real work.</span></>}
        description="Watch CPAAutomation handle real accounting, finance, and legal workflows—from source document to finished work."
        actions={<><SiteButton href="/pricing" variant="light">Get started</SiteButton><SiteButton href="/contact" variant="ghost">Ask a question</SiteButton></>}
      />
      {DEMO_GROUPS.map((group, groupIndex) => (
        <section className={groupIndex % 2 ? 'ps-section ps-section--soft' : 'ps-section'} key={group.name}>
          <div className="ps-container">
            <SectionHeading number={`00${groupIndex + 1}`} eyebrow={group.name} title={group.name} description={group.description} />
            <div className="ps-demo-grid">
              {group.videos.map(([title, id], index) => (
                <Reveal className={index === 0 ? 'ps-demo-card ps-demo-card--wide' : 'ps-demo-card'} key={id}>
                  <div className="ps-video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={title} loading="lazy" allowFullScreen /></div>
                  <span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  )
}

const CONSULTING_PILLARS = [
  [Code2, 'Technical depth', 'Production software, agents, integrations, and data systems—not a strategy deck.'],
  [BriefcaseBusiness, 'Business fluency', 'Accountants, finance operators, and legal professionals can work directly with the builders.'],
  [Handshake, 'Embedded delivery', 'A senior team scopes, ships, and transfers a working system alongside your people.'],
]

export function PublicConsulting() {
  return (
    <>
      <PageHero
        eyebrow="Forward-deployed consulting"
        title={<>Bring AI into the work <span className="ps-gradient-text">your team actually does.</span></>}
        description="We embed technical and business expertise with your team to design, build, and ship custom AI workflows end to end."
        actions={<><SiteButton href="/contact" variant="light">Book a discovery call</SiteButton><SiteButton href="#engagement" variant="ghost">How we engage</SiteButton></>}
      />
      <section className="ps-section">
        <div className="ps-container">
          <SectionHeading number="001" eyebrow="Why forward-deployed" title="Software in your environment—not recommendations on a slide." description="You work with the people building the system, with tight feedback loops and clear ownership from first scope to production." />
          <div className="ps-value-grid">
            {CONSULTING_PILLARS.map(([Icon, title, body], index) => {
              const PillarIcon = Icon as typeof Code2
              return <Reveal key={title as string} className="ps-value-card"><div className="ps-value-card__top"><span><PillarIcon /></span><b>0{index + 1}</b></div><h3>{title as string}</h3><p>{body as string}</p></Reveal>
            })}
          </div>
        </div>
      </section>
      <section className="ps-section ps-section--ink" id="engagement">
        <div className="ps-container">
          <SectionHeading number="002" eyebrow="Engagement model" title="From first conversation to shipped software." />
          <div className="ps-process">
            {[
              ['01', 'Discover', 'Map the workflow, users, controls, source systems, and highest-value outcome.'],
              ['02', 'Scope', 'Define a bounded build, delivery milestones, acceptance criteria, and fixed-price proposal.'],
              ['03', 'Build', 'Ship in short loops with your users reviewing real software—not mockups.'],
              ['04', 'Operate', 'Deploy, document, train, and support the system until ownership is clear.'],
            ].map(([number, title, body]) => <Reveal className="ps-process__item" key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></Reveal>)}
          </div>
        </div>
      </section>
      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          <SectionHeading number="003" eyebrow="What we build" title="Custom systems for high-stakes professional work." />
          <div className="ps-capability-grid">
            {[
              { icon: BrainCircuit, title: 'AI copilots and agents', body: 'Domain-aware assistants, review systems, and autonomous workers with explicit controls.' },
              { icon: Workflow, title: 'Workflow automation', body: 'Cross-system automation with human review at the points where judgment matters.' },
              { icon: FileSearch2, title: 'Document intelligence', body: 'Extraction, classification, validation, and downstream action for complex document sets.' },
              { icon: ShieldCheck, title: 'LLM governance', body: 'Risk tiers, policies, approval workflows, evaluation, and operational control design.', href: '/consulting/llm-governance' },
            ].map(({ icon: CardIcon, title, body, href }, index) => (
              <Reveal className="ps-simple-card" key={title}>
                <div><span>0{index + 1}</span><CardIcon /></div>
                <h3>{title}</h3>
                <p>{body}</p>
                {href && <Link href={href} className="ps-simple-card__link" aria-label="View the LLM governance slide deck">View the slide deck <ArrowUpRight aria-hidden /></Link>}
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

export { PublicFeatures } from './products'

export function PublicAbout() {
  return (
    <>
      <PageHero eyebrow="About CPAAutomation" title={<>Built from the work, <span className="ps-gradient-text">not around the hype.</span></>} description="CPAAutomation began with a practical question: why are professionals still buried in repetitive work that software can handle?" />
      <section className="ps-section">
        <div className="ps-container ps-about-story">
          <Reveal className="ps-about-portrait"><Image src="/ian.jpg" alt="Ian Stewart, founder of CPAAutomation" width={760} height={900} priority /></Reveal>
          <Reveal className="ps-about-copy">
            <span>001 · Founder story</span><h2>Engineering shaped by a CPA household.</h2>
            <p>Ian Stewart grew up watching his mother work long hours as a CPA, juggling paperwork that took time away from clients and higher-value problem solving.</p>
            <p>He combined that firsthand perspective with a passion for building software. CPAAutomation grew from a document-analysis project into a connected platform for accounting, finance, and legal professionals.</p>
            <strong>Ian Stewart</strong><small>Founder &amp; engineer</small>
          </Reveal>
        </div>
      </section>
      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          <SectionHeading number="002" eyebrow="Professional validation" title="Pressure-tested by people who know the documents." />
          <div className="ps-proof-grid">
            <Reveal className="ps-proof-card ps-proof-card--quote"><Quote /><blockquote>“Provided extensive validation of our extraction algorithms for healthcare-industry financial documents and compliance requirements.”</blockquote><p>Rae Stewart · Senior Director, Accounting</p></Reveal>
            <Reveal className="ps-proof-card ps-proof-card--quote"><Quote /><blockquote>“Validated our platform’s ability to handle complex technology-sector financial processes and automation workflows.”</blockquote><p>Ray Sang · Finance Systems</p></Reveal>
          </div>
        </div>
      </section>
      <section className="ps-section">
        <div className="ps-container">
          <SectionHeading number="003" eyebrow="What we stand for" title="Professional accuracy, useful software, responsible AI." />
          <div className="ps-value-grid">
            {[[Target, 'Professional accuracy', 'Every workflow is built around review, traceability, and accountable professional judgment.'], [ShieldCheck, 'Data responsibility', 'Customer data remains protected and is never used to train shared models.'], [Sparkles, 'Useful simplicity', 'Powerful automation should feel familiar enough to use in the middle of a busy close or engagement.']].map(([Icon, title, body], index) => { const VIcon = Icon as typeof Target; return <Reveal className="ps-value-card" key={title as string}><div className="ps-value-card__top"><span><VIcon /></span><b>0{index + 1}</b></div><h3>{title as string}</h3><p>{body as string}</p></Reveal> })}
          </div>
        </div>
      </section>
    </>
  )
}

export function PublicCaseStudy() {
  return (
    <>
      <PageHero eyebrow="Customer story · Leonardo Family Office" title={<>Three days of quarterly processing, <span className="ps-gradient-text">reduced to two hours.</span></>} description="How a family office automated investment-statement processing across more than 100 portfolio companies." actions={<SiteButton href="/contact" variant="light">Discuss your workflow</SiteButton>} />
      <section className="ps-section">
        <div className="ps-container">
          <div className="ps-case-metrics">
            {[[Clock3, '200+', 'hours saved annually'], [Users, '100+', 'portfolio companies'], [BarChart3, '95%', 'time reduction'], [BadgeCheck, '99.8%', 'extraction accuracy']].map(([Icon, value, label]) => { const MetricIcon = Icon as typeof Clock3; return <Reveal key={label as string}><MetricIcon /><strong>{value as string}</strong><span>{label as string}</span></Reveal> })}
          </div>
        </div>
      </section>
      <section className="ps-section ps-section--soft"><div className="ps-container ps-case-body"><aside>001<br />The challenge</aside><div><h2>Quarterly reports arrived in inconsistent formats from more than 100 portfolio companies.</h2><p>The investment team manually transcribed revenue, equity, valuation, and currency information under tight reporting deadlines. A single report could take 30 minutes, with limited room to scale and continual risk of transcription errors.</p></div></div></section>
      <section className="ps-section"><div className="ps-container ps-case-body"><aside>002<br />The solution</aside><div><h2>Custom extraction rules turned every statement into a consistent, reviewable dataset.</h2><p>CPAAutomation classified valuation types, recognized foreign currencies, extracted core financial metrics, and placed validation into the workflow before export.</p><ul><li><Check />Custom templates for revenue, equity, and valuation</li><li><Check />Automated valuation classification</li><li><Check />Foreign-currency recognition</li><li><Check />Quality-assurance and validation workflows</li></ul></div></div></section>
      <section className="ps-section ps-section--ink"><div className="ps-container ps-case-body"><aside>003<br />The result</aside><div><h2>From manual transcription to a repeatable quarterly system.</h2><p>Processing fell from three days to two hours. Individual reports moved from roughly 30 minutes to about five seconds, while standardized formats and real-time validation removed the transcription bottleneck.</p></div></div></section>
    </>
  )
}
