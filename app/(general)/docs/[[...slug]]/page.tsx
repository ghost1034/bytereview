import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import {
  PublicDocsContent,
  PublicDocsIndex,
  PublicDocsPager,
  PublicDocsToc,
  type PublicPagerLink,
} from '@/components/public-site/docs'
import { extractHeadings, loadDocsTree, readDocPage } from '@/lib/docs/content'
import {
  type DocSlugPair,
  allDocSlugPairs,
  docHref,
  findSection,
  getAdjacentSlugPairs,
  getBreadcrumbs,
  isValidDocPath,
} from '@/lib/docs/navigation'

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>
}

// Statically pre-render the index (empty slug) plus every page found on disk.
export async function generateStaticParams() {
  const tree = await loadDocsTree()
  return [
    { slug: [] as string[] },
    ...allDocSlugPairs(tree).map((pair) => ({ slug: [pair.sectionSlug, pair.pageSlug] })),
  ]
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params
  const tree = await loadDocsTree()
  if (!isValidDocPath(tree, slug)) {
    return {
      title: 'Documentation — CPAAutomation',
      description: 'Guides and reference for the CPAAutomation product suite.',
    }
  }
  const section = findSection(slug[0])!
  const page = await readDocPage(slug[0], slug[1])
  if (!page) {
    return { title: 'Documentation — CPAAutomation' }
  }
  return {
    title: `${page.meta.title} · ${section.title} — CPAAutomation Docs`,
    description: page.meta.description,
  }
}

/** Resolve an adjacent slug pair to a pager link (title from its frontmatter). */
async function toPagerLink(pair: DocSlugPair | null): Promise<PublicPagerLink | null> {
  if (!pair) return null
  const section = findSection(pair.sectionSlug)
  if (!section) return null
  const page = await readDocPage(pair.sectionSlug, pair.pageSlug)
  return {
    href: docHref(pair.sectionSlug, pair.pageSlug),
    title: page?.meta.title ?? pair.pageSlug,
    sectionTitle: section.title,
  }
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params
  const tree = await loadDocsTree()

  // Index route: /docs
  if (!slug || slug.length === 0) {
    return <PublicDocsIndex sections={tree} />
  }

  if (!isValidDocPath(tree, slug)) notFound()
  const [sectionSlug, pageSlug] = slug

  const section = findSection(sectionSlug)!
  const page = await readDocPage(sectionSlug, pageSlug)
  if (!page) notFound()

  const firstPageSlug = tree.find((s) => s.slug === sectionSlug)?.pages[0]?.slug
  const headings = extractHeadings(page.body)
  const crumbs = getBreadcrumbs(section, firstPageSlug, page.meta.title)
  const adjacent = getAdjacentSlugPairs(tree, sectionSlug, pageSlug)
  const [prev, next] = await Promise.all([
    toPagerLink(adjacent.prev),
    toPagerLink(adjacent.next),
  ])

  return (
    <div className="ps-doc-article-grid">
      <article>
        <nav className="ps-doc-breadcrumbs" aria-label="Breadcrumb">{crumbs.map((crumb, index) => <Fragment key={crumb.label}>{index > 0 && <span>/</span>}{crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <strong>{crumb.label}</strong>}</Fragment>)}</nav>
        <header className="ps-doc-article-head"><span>{section.title}</span><h1>{page.meta.title}</h1>{page.meta.description && <p>{page.meta.description}</p>}</header>
        <PublicDocsContent markdown={page.body} />
        <PublicDocsPager prev={prev} next={next} />
      </article>
      <aside><PublicDocsToc headings={headings} /></aside>
    </div>
  )
}
