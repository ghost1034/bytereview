'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, BadgeCheck, Check, LockKeyhole, Network, Play, Quote, ShieldCheck, Sparkles } from 'lucide-react'
import AuthModal from '@/components/auth/AuthModal'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscriptionPlans } from '@/hooks/useBilling'
import { PRODUCTS } from '../content'
import { getPublicPlanFeatures, getPublicPlanPrice, getPublicPricingState } from '../model'
import { HOME_CAPABILITIES, HOME_FAQS, HOME_INTEGRATIONS, HOME_PEOPLE, HOME_PROOF, HOME_QUOTES, HOME_SECURITY, HOME_VALUES } from '../home-content'
import { HomeCarousel, HomeTimeline, VideoLightbox } from '../home-interactions'
import { Eyebrow, Reveal, SectionHeading, SiteButton } from '../ui'

const GlobeBackground = dynamic(() => import('../three/GlobeBackground'), { ssr: false })

function VoiceCard({ item }: { item: typeof HOME_QUOTES[number] }) {
  return <figure className="ph-quote">
    <figcaption>
      {item.image ? <Image src={item.image} width={56} height={56} alt="" /> : <span className="ph-quote__avatar" aria-hidden>{item.initials ?? <LockKeyhole aria-hidden />}</span>}
      <div><strong>{item.name}</strong><span>{item.role}</span></div>{item.kind === 'validation' ? <ShieldCheck aria-hidden /> : <Quote aria-hidden />}
    </figcaption>
    {item.kind === 'validation' ? <p>{item.quote}</p> : <blockquote>{item.quote}</blockquote>}
  </figure>
}

function DemoCard({ videoId, title, image }: { videoId: string; title: string; image: string }) {
  return <VideoLightbox videoId={videoId} title={title} className="ph-demo">
    <Image src={image} alt="" fill sizes="(max-width: 991px) 80vw, 33vw" />
    <span className="ph-demo__play"><Play aria-hidden /></span>
    <span className="ph-demo__copy"><small>CPAAutomation · Product demo</small><strong>{title}</strong></span>
  </VideoLightbox>
}

function HomePricing() {
  const { data: plans, isLoading, isError, refetch } = useSubscriptionPlans()
  const sortedPlans = [...(plans ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const state = getPublicPricingState({ isLoading, isError, planCount: sortedPlans.length })
  return <>
    <p className="ph-pricing-period">Monthly plans <span /> No annual commitment</p>
    {state !== 'ready' ? <div className="ph-pricing-state" role={state === 'error' ? 'alert' : 'status'}>
      <p>{state === 'loading' ? 'Loading available plans…' : state === 'error' ? 'Plans could not be loaded.' : 'No plans are currently available.'}</p>
      {state === 'error' && <button type="button" onClick={() => void refetch()}>Try again</button>}
      {state !== 'loading' && <Link href="/pricing">Visit pricing <ArrowUpRight aria-hidden /></Link>}
    </div> : <div className="ph-pricing-table">
      {sortedPlans.map((plan) => <article className={`ph-plan${plan.code === 'pro' ? ' ph-plan--featured' : ''}`} key={plan.code}>
        <div className="ph-plan__top">
          <span className="ph-plan__icon"><Sparkles aria-hidden /></span>
          {plan.code === 'pro' && <span className="ph-plan__tag">Most popular</span>}
          <h3>{plan.display_name}</h3>
          <p>{plan.code === 'free' ? 'Explore your first workflow' : plan.code === 'basic' ? 'For everyday professional work' : 'For teams ready to scale'}</p>
          <div className="ph-plan__price"><strong>{getPublicPlanPrice(plan.code)}</strong>{plan.code !== 'free' && <span>/Month</span>}</div>
        </div>
        <div className="ph-plan__bottom"><strong>What’s included:</strong><ul>{getPublicPlanFeatures(plan).map((feature) => <li key={feature}><Check aria-hidden />{feature}</li>)}</ul>
          <SiteButton href={plan.code === 'free' ? '/pricing' : `/pricing?plan=${encodeURIComponent(plan.code)}`}>Explore {plan.display_name}</SiteButton>
        </div>
      </article>)}
    </div>}
    <div className="ph-consult-cta"><div><h3>A workflow that needs a custom build?</h3><p>Talk with the people who will design and ship it.</p></div><SiteButton href="/consulting">Explore consulting</SiteButton></div>
  </>
}

export default function PublicHome() {
  const [authOpen, setAuthOpen] = useState(false)
  const { user, requiresMfaEnrollment } = useAuth()
  const router = useRouter()
  const start = () => {
    if (user) router.push(requiresMfaEnrollment ? '/complete-signup' : '/dashboard')
    else setAuthOpen(true)
  }

  return <div className="ph-home">
    <section className="ps-home-hero" aria-label="CPAAutomation">
      <GlobeBackground />
      <div className="ps-home-hero__shade" aria-hidden />
      <div className="ph-container ps-home-hero__content">
        <div className="ps-home-hero__eyebrow"><BadgeCheck aria-hidden />Built for professional work</div>
        <h1>Intelligent Automation<br />for Modern Professionals</h1>
        <p>One AI platform for the documents, decisions, and workflows that power accounting, finance, and legal teams.</p>
        <div className="ps-home-hero__actions"><SiteButton onClick={start}>{user ? 'Go to dashboard' : 'Get started free'}</SiteButton><SiteButton href="#CTA-Form" variant="ghost"><span className="ps-button__people" aria-hidden><Image src="/ian.jpg" alt="" width={28} height={28} /><Image src="/ray.jpg" alt="" width={28} height={28} /></span>Work with us</SiteButton></div>
      </div>
    </section>

    <div className="ph-brand-strip">
      <div className="ph-container"><div className="ph-marquee" aria-label="Eleven CPAAutomation products"><div className="ph-marquee__track">
        {[0, 1].map((copy) => <div className="ph-brand-list" key={copy} aria-hidden={copy === 1 || undefined}>{PRODUCTS.map((product) => { const Icon = product.icon; return <span key={product.name}><Icon aria-hidden />{product.name}</span> })}</div>)}
      </div></div></div>
    </div>

    <section className="ph-section ph-about" id="about-section">
      <div className="ph-container">
        <Reveal className="ph-about__intro"><Eyebrow number="001">Who we are</Eyebrow><h2>We bring document intelligence, professional writing, engagement operations, analytics, and AI agents into one connected platform.</h2></Reveal>
        <Reveal className="ph-about__media">
          <div className="ph-statistics" aria-label="11 purpose-built products, 3 professional domains, 1 connected platform"><div className="ph-marquee__track" aria-hidden>{[0, 1].map((copy) => <div key={copy}><span>11 <b>products</b></span><span>3 <b>professional domains</b></span><span>1 <b>connected platform</b></span></div>)}</div></div>
          <VideoLightbox videoId="tNwpajJZ8zA" title="Build a P&L in two minutes" className="ph-about__video">
            <Image src="/public-site/caseimg1.png" alt="" fill sizes="(max-width: 767px) 70vw, 600px" />
            <span className="ph-demo__play"><Play aria-hidden /></span><span className="ph-about__caption">See CPAAutomation in action</span>
          </VideoLightbox>
        </Reveal>
      </div>
    </section>

    <section className="ph-section" id="values-section"><div className="ph-container ph-container--medium">
      <SectionHeading number="002" eyebrow="Values" title="Why Choose Us?" description="Professional judgment deserves software built around the way you work." />
      <Reveal className="ph-values">{HOME_VALUES.map((value, index) => { const Icon = value.icon; return <article className="ph-value" key={value.title}><div className="ph-value__visual"><div className="ph-value__halo"><span><Icon aria-hidden /></span></div><b>0{index + 1}</b></div><div className="ph-value__copy"><h3>{value.title}</h3><p>{value.body}</p></div></article> })}</Reveal>
    </div></section>

    <section className="ph-section" id="service-section"><div className="ph-container">
      <SectionHeading number="003" eyebrow="Capabilities" title="Your AI-Powered Platform" />
      <Reveal className="ph-capabilities">
        {HOME_CAPABILITIES.map((item, index) => <article className={`ph-capability${index === 0 ? ' ph-capability--lead' : ''}`} key={item.title}>
          <div><h3>{item.title}</h3><p>{item.body}</p><ul>{item.products.map((product) => <li key={product}><Check aria-hidden />{product}</li>)}</ul></div>
          <div className="ph-capability__image"><Image src={`/public-site/${item.image}`} alt="Illustrative automation workflow" width={item.image === 'cap1.png' ? 752 : 656} height={item.image === 'cap1.png' ? 790 : 280} /></div>
          <Link href={item.href} aria-label={`Explore ${item.title.replace(/\.$/, '')}`}>Explore <ArrowUpRight aria-hidden /></Link>
        </article>)}
        <aside className="ph-capability-cta"><span className="ph-contact-portraits"><Image src="/ian.jpg" alt="" width={80} height={80} /><Image src="/ray.jpg" alt="" width={80} height={80} /></span><div><h3>Let’s build your next workflow.</h3><p>Custom AI software, delivered alongside your team.</p></div><SiteButton href="/consulting">Work with us</SiteButton></aside>
        <article className="ph-security"><h3>Your Data. Protected. Always.</h3><div>{HOME_SECURITY.map(([image, title]) => <div key={title}><Image src={`/public-site/${image}`} alt="" width={92} height={92} /><span>{title}</span></div>)}</div></article>
      </Reveal>
    </div></section>

    <section className="ph-section" id="process-section"><div className="ph-container ph-container--medium"><SectionHeading number="004" eyebrow="Process" title="From Source to Finished Work" description="A familiar workflow, with AI handling the heavy lifting and professional judgment in control." /><HomeTimeline /></div></section>

    <section className="ph-section" id="project-section"><div className="ph-container"><SectionHeading number="005" eyebrow="In practice" title="See What’s Possible" /><HomeCarousel label="Customer stories and demonstrations" kind="proof">{HOME_PROOF.map((item) => <article className="ph-case" key={item.title}>
      <div className="ph-case__image"><Image src={`/public-site/${item.image}`} alt="" fill sizes="(max-width: 991px) 90vw, 520px" />{item.videoId && <VideoLightbox videoId={item.videoId} title={item.title} className="ph-case__play"><Play aria-hidden /></VideoLightbox>}</div>
      <div className="ph-case__copy"><div><span className="ph-case__label">{item.label}</span><h3>{item.title}</h3><p>{item.body}</p><Link href={item.href}>{item.linkLabel}<ArrowUpRight aria-hidden /></Link></div><dl>{item.metrics.map(([value, label]) => <div key={label}><dt>{value}</dt><dd>{label}</dd></div>)}</dl></div>
    </article>)}</HomeCarousel></div></section>

    <section className="ph-section" id="integrations-section"><div className="ph-container"><SectionHeading number="006" eyebrow="Connected work" title="Your Technology Ecosystem" /></div>
      <div className="ph-ecosystem"><div className="ph-integration-lines">{[0, 1, 2].map((row) => <div className="ph-integration-line" key={row}><div className="ph-marquee__track">{[0, 1].map((copy) => <div className="ph-integration-list" key={copy} aria-hidden={copy === 1 || undefined}>{[...HOME_INTEGRATIONS.slice(row * 2), ...HOME_INTEGRATIONS.slice(0, row * 2)].map((item) => { const Icon = item.icon; return <div className="ph-integration" key={item.name}><div><strong>{item.name}</strong><small>{item.detail}</small></div><Icon aria-hidden /></div> })}</div>)}</div></div>)}</div>
        <Link href="/features" className="ph-ecosystem__hub"><Network aria-hidden /><span>One connected<br />platform</span><ArrowUpRight aria-hidden /></Link>
      </div><p className="ph-ecosystem__caption">Connect source material, review, and delivery through native integrations and familiar file formats. Keep the tools your team already uses.</p>
    </section>

    <section className="ph-section" id="testimonials-section"><div className="ph-container"><SectionHeading number="007" eyebrow="Professional voices" title="What They’re Saying" />
      <Reveal className="ph-testimonials">
        <div><DemoCard videoId="tNwpajJZ8zA" title="Build a P&L in two minutes" image="/public-site/caseimg1.png" /><VoiceCard item={HOME_QUOTES[0]} /></div>
        <div><VoiceCard item={HOME_QUOTES[1]} /><VoiceCard item={HOME_QUOTES[3]} /><VoiceCard item={HOME_QUOTES[2]} /></div>
        <div><VoiceCard item={HOME_QUOTES[4]} /><DemoCard videoId="OaloCO7Bh28" title="A professional investor report, in minutes" image="/public-site/case3.png" /></div>
      </Reveal><p className="ph-testimonials__note"><LockKeyhole aria-hidden />Customer names abbreviated to protect confidentiality. Product demos are labeled separately.</p>
    </div></section>

    <section className="ph-section" id="pricing-section"><div className="ph-container ph-container--medium"><SectionHeading number="008" eyebrow="Pricing" title="Built for Every Stage" description="Start free. Add capacity when the workflow proves itself." /><HomePricing /></div></section>

    <section className="ph-section" id="team-section"><div className="ph-container"><SectionHeading number="009" eyebrow="People" title="Built Close to the Work" description="Meet the people building and validating CPAAutomation." /><HomeCarousel kind="people" label="The people behind CPAAutomation">{HOME_PEOPLE.map((person) => <article className="ph-person" key={person.name}><div className="ph-person__image"><Image src={person.image} alt={person.name} width={594} height={760} /><Link href={person.href}>{person.action}<ArrowUpRight aria-hidden /></Link></div><h3>{person.name}</h3><p>{person.role}</p></article>)}</HomeCarousel></div></section>

    <section className="ph-section ph-faq" id="FAQ-section"><div className="ph-container ph-container--medium"><SectionHeading number="010" eyebrow="FAQs" title="Common Questions" />
      <Accordion type="single" collapsible className="ph-faq-list">{HOME_FAQS.map(([question, answer], index) => <AccordionItem className="ph-faq-item" value={`faq-${index}`} key={question}><AccordionTrigger><span className="ph-faq-item__number">{index + 1}</span><span>{question}</span></AccordionTrigger><AccordionContent>{answer}</AccordionContent></AccordionItem>)}</Accordion>
      <div className="ph-faq-cta"><p>Still have a question?</p><Link href="/contact">Let’s talk <ArrowUpRight aria-hidden /></Link></div>
    </div></section>
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectTo="/dashboard" defaultTab="signin" />
  </div>
}
