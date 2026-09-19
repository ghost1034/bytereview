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
    id: 'document-analysis',
    name: 'Document intelligence',
    description: 'Turn source documents into structured data and useful analysis.',
    videos: [
      { title: 'Build P&L in 2 Minutes', id: 'tNwpajJZ8zA', description: 'Turn financial source documents into a structured profit-and-loss report with Universal Document Analysis.' },
      { title: 'Bank Statement Analysis', id: 'mxDEliIRWtc', description: 'See how AI extracts and organizes bank statement data for financial review.' },
      { title: 'Invoice Extraction and Contract Review', id: 'uWA5ds9VuPM', description: 'Extract key details from invoices and review contract terms with AI-assisted document analysis.' },
      { title: 'Email and Google Drive Automations', id: 'R0ubnn4ggGA', description: 'Connect email and Google Drive to automate recurring document-processing workflows.' },
    ],
  },
  {
    id: 'writing-and-forms',
    name: 'Writing and forms',
    description: 'Complete forms and draft professional documents with supporting sources.',
    videos: [
      { title: 'Automatically Fill Any PDF or Word Document with AI', id: 'Jgv9cP-vT1Y', description: 'Use AI to populate PDF and Word forms from your source information.' },
      { title: 'Write a Professional Investor Report in Minutes with AI', id: 'OaloCO7Bh28', description: 'Follow an AI-assisted workflow for turning investment information into a professional investor report.' },
      { title: 'Write a Legal Complaint Faster with AI', id: 'pNpDUlNZuuU', description: 'See how Inkwise helps organize case information and draft a legal complaint.' },
      { title: 'Write a Robust Academic Article with 70+ References Using AI', id: 'qmFBxibcals', description: 'Build a research-based academic article using AI-assisted drafting and an extensive reference library.' },
      { title: 'Generate Accurate Academic & Legal Citations with AI', id: 'zloKYPE0Vjw', description: 'Create academic and legal citations to support your writing and connect claims to their sources.' },
      { title: 'How Inkwise Prevents AI Hallucinations with RAG', id: 'e5rytCGzzec', description: 'Learn how Inkwise retrieves relevant source material to ground AI-generated writing.' },
    ],
  },
  {
    id: 'everyday-workflows',
    name: 'Everyday workflows',
    description: 'Keep signatures, billable time, and continuing education organized.',
    videos: [
      { title: 'Send & Sign PDFs for Free with CPAAutomation eSign', id: 'QnpKCSrOGB8', description: 'Walk through sending a PDF for signature and completing the signing process with eSign.' },
      { title: 'Track Billable Hours Automatically with AI', id: 'QNCVh1SKS9A', description: 'See how Chrona helps reconstruct your workday and turn activity into billable time entries.' },
      { title: 'Free CPE Tracker', id: 'gchB4SbxsJM', description: 'Explore a simple way to organize continuing professional education and track your credits.' },
    ],
  },
  {
    id: 'ai-agents',
    name: 'AI agents',
    description: 'Put digital workers to work across accounting tools, browsers, and Slack.',
    videos: [
      { title: 'AccountingClaw Preview', id: '976yIJsO1cA', description: 'Get a first look at AccountingClaw and its approach to AI-assisted accounting workflows.' },
      { title: 'Dual Agent Technical Accounting Memo', id: 'hePBTs8MnFQ', description: 'Watch two AI agents collaborate on a technical accounting memo.' },
      { title: 'AI Skill for Browser Automation', id: '939uCq5jxN0', description: 'See an AI agent use a reusable skill to carry out tasks in a web browser.' },
      { title: 'Automate Universal Document Analysis with AccountingClaw', id: 'w4HB7m8XEUQ', description: 'Use AccountingClaw to run document-analysis workflows through Universal Document Analysis.' },
      { title: 'Get Your AI Digital Workers on Slack', id: 'bnB6fy3KaA4', description: 'Bring AI digital workers into Slack so your team can collaborate with them where conversations happen.' },
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
      <div className="ps-demo-library ps-container">
        <nav className="ps-demo-nav" aria-label="Demo categories">
          <p>Browse by workflow</p>
          <ul>
            {DEMO_GROUPS.map((group) => (
              <li key={group.id}><a href={`#${group.id}`}>{group.name}<span>{group.videos.length} videos</span></a></li>
            ))}
          </ul>
        </nav>
        {DEMO_GROUPS.map((group) => (
          <section className="ps-demo-category" id={group.id} aria-labelledby={`${group.id}-heading`} key={group.id}>
            <header className="ps-demo-category__heading">
              <h2 id={`${group.id}-heading`}>{group.name}</h2>
              <p>{group.description}</p>
            </header>
            <div className="ps-demo-grid">
              {group.videos.map(({ title, id, description }) => (
                <article className="ps-demo-card" aria-labelledby={`demo-${id}`} key={id}>
                  <div className="ps-video-frame">
                    <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={title} loading="lazy" allowFullScreen />
                  </div>
                  <div className="ps-demo-card__copy">
                    <h3 id={`demo-${id}`}>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
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
