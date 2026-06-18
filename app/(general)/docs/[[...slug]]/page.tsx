import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { DocsContent } from '@/components/docs/docs-content'
import { DocsIndex } from '@/components/docs/docs-index'
import { DocsPager, type PagerLink } from '@/components/docs/docs-pager'
import { DocsToc } from '@/components/docs/docs-toc'
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
async function toPagerLink(pair: DocSlugPair | null): Promise<PagerLink | null> {
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
    return <DocsIndex sections={tree} />
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
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_200px] xl:gap-10">
      <article className="min-w-0">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.label}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          eyebrow={section.title}
          title={page.meta.title}
          description={page.meta.description}
        />

        <DocsContent markdown={page.body} />

        <DocsPager prev={prev} next={next} />
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-[calc(var(--header-height)+1.5rem)]">
          <DocsToc headings={headings} />
        </div>
      </aside>
    </div>
  )
}
