'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { cn } from '@/lib/utils'

export function Reveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)
    const context = gsap.context(() => {
      gsap.fromTo(node, { autoAlpha: 0, y: 32, filter: 'blur(5px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: .8, ease: 'power3.out', scrollTrigger: { trigger: node, start: 'top 88%', once: true } })
    }, node)
    return () => context.revert()
  }, [])

  return (
    <div ref={ref} className={cn('ps-reveal', className)}>
      {children}
    </div>
  )
}

export function SiteButton({
  href,
  children,
  variant = 'dark',
  onClick,
}: {
  href?: string
  children: ReactNode
  variant?: 'dark' | 'light' | 'ghost'
  onClick?: () => void
}) {
  const className = cn('ps-button', `ps-button--${variant}`)
  const content = (
    <>
      <span>{children}</span>
      <span className="ps-button__icon" aria-hidden>
        <ArrowUpRight />
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  )
}

export function Eyebrow({ number, children }: { number: string; children: ReactNode }) {
  return (
    <div className="ps-eyebrow">
      <span className="ps-eyebrow__number">{number}</span>
      <span className="ps-eyebrow__label">
        <span className="ps-eyebrow__dot" aria-hidden />
        {children}
      </span>
    </div>
  )
}

export function SectionHeading({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string
  eyebrow: string
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <Reveal className="ps-section-heading">
      <Eyebrow number={number}>{eyebrow}</Eyebrow>
      <div className="ps-section-heading__copy">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </Reveal>
  )
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="ps-page-hero">
      <div className="ps-page-hero__glow" aria-hidden />
      <div className="ps-container ps-page-hero__inner">
        <div className="ps-page-hero__eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
        {actions && <div className="ps-page-hero__actions">{actions}</div>}
      </div>
    </section>
  )
}

export function Marquee({ items }: { items: string[] }) {
  return (
    <div className="ps-marquee" aria-label={items.join(', ')}>
      <div className="ps-marquee__track" aria-hidden>
        {[...items, ...items].map((item, index) => (
          <span key={`${item}-${index}`}>
            {item}
            <i />
          </span>
        ))}
      </div>
    </div>
  )
}

export function DotPattern() {
  return <span className="ps-dot-pattern" aria-hidden />
}
