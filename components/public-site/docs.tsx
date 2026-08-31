'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronRight, Menu, Search, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'

import type { DocHeading } from '@/lib/docs/content'
import { type DocsTree, DOCS_BASE, docHref, findSection } from '@/lib/docs/navigation'
import { cn } from '@/lib/utils'
import { searchPublicDocs } from './model'

export interface PublicPagerLink {
  href: string
  title: string
  sectionTitle: string
}

function DocsSearch({ sections, onNavigate }: { sections: DocsTree; onNavigate?: () => void }) {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const results = useMemo(() => searchPublicDocs(sections, query), [query, sections])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        document.getElementById('public-doc-search')?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const go = (href: string) => {
    setQuery('')
    onNavigate?.()
    router.push(href)
  }

  return (
    <div className="ps-doc-search">
      <Search aria-hidden />
      <input id="public-doc-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation" aria-label="Search documentation" />
      <kbd>⌘K</kbd>
      {query && <div className="ps-doc-search__results">{results.length ? results.map(({ section, page }) => <button type="button" key={`${section.slug}/${page.slug}`} onClick={() => go(docHref(section.slug, page.slug))}><span>{section.title}</span><strong>{page.title}</strong></button>) : <p>No documentation found.</p>}</div>}
    </div>
  )
}

function DocsNav({ sections, onNavigate }: { sections: DocsTree; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="ps-doc-nav" aria-label="Documentation">
      {sections.map((section) => {
        const Icon = findSection(section.slug)?.icon
        const activeSection = pathname.startsWith(`${DOCS_BASE}/${section.slug}`)
        return (
          <details key={section.slug} open={activeSection || undefined}>
            <summary>{Icon && <Icon />}<span>{section.title}</span><ChevronRight /></summary>
            <div>{section.pages.map((page) => { const href = docHref(section.slug, page.slug); const active = pathname === href; return <Link key={href} href={href} aria-current={active ? 'page' : undefined} onClick={onNavigate}>{page.title}</Link> })}</div>
          </details>
        )
      })}
    </nav>
  )
}

export function PublicDocsSidebar({ sections }: { sections: DocsTree }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <aside className="ps-doc-sidebar"><DocsSearch sections={sections} /><DocsNav sections={sections} /></aside>
      <button className="ps-doc-mobile-trigger" type="button" onClick={() => setOpen(true)}><Menu />Browse docs</button>
      {open && <div className="ps-doc-mobile" role="dialog" aria-modal="true" aria-label="Documentation navigation"><div><button type="button" onClick={() => setOpen(false)} aria-label="Close documentation navigation"><X /></button><DocsSearch sections={sections} onNavigate={() => setOpen(false)} /><DocsNav sections={sections} onNavigate={() => setOpen(false)} /></div></div>}
    </>
  )
}

export function PublicDocsIndex({ sections }: { sections: DocsTree }) {
  return (
    <div className="ps-doc-index">
      <span>Documentation</span><h1>Build with the whole CPAAutomation platform.</h1><p>Product guides, setup instructions, and workflow reference for every available product.</p>
      <div className="ps-doc-index__grid">{sections.map((section, index) => { const config = findSection(section.slug); const first = section.pages[0]; if (!config || !first) return null; const Icon = config.icon; return <Link href={docHref(section.slug, first.slug)} key={section.slug}><span>{String(index + 1).padStart(2, '0')}</span><Icon /><h2>{section.title}</h2><p>{section.description}</p><strong>Open guide <ArrowRight /></strong></Link> })}</div>
    </div>
  )
}

export function PublicDocsContent({ markdown }: { markdown: string }) {
  return (
    <div className="ps-doc-content">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize, rehypeSlug]} components={{ a: ({ href, children }) => { const external = typeof href === 'string' && /^https?:\/\//.test(href); return <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>{children as ReactNode}</a> } }}>{markdown}</ReactMarkdown>
    </div>
  )
}

export function PublicDocsToc({ headings }: { headings: DocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    const elements = headings.map((heading) => document.getElementById(heading.id)).filter((element): element is HTMLElement => Boolean(element))
    const observer = new IntersectionObserver((entries) => { const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (current) setActiveId(current.target.id) }, { rootMargin: '-112px 0px -70% 0px' })
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [headings])
  if (headings.length < 2) return null
  return <nav className="ps-doc-toc" aria-label="On this page"><strong>On this page</strong>{headings.map((heading) => <a href={`#${heading.id}`} key={heading.id} className={cn(heading.level === 3 && 'is-nested', activeId === heading.id && 'is-active')}>{heading.text}</a>)}</nav>
}

export function PublicDocsPager({ prev, next }: { prev: PublicPagerLink | null; next: PublicPagerLink | null }) {
  return <nav className="ps-doc-pager">{prev ? <Link href={prev.href}><span><ArrowLeft />Previous</span><strong>{prev.title}</strong><small>{prev.sectionTitle}</small></Link> : <i />}{next ? <Link href={next.href}><span>Next<ArrowRight /></span><strong>{next.title}</strong><small>{next.sectionTitle}</small></Link> : <i />}</nav>
}
