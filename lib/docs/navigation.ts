import type { ComponentType } from 'react'
import { BarChart3, Bot, Clock, FileText, Files, PenTool } from 'lucide-react'

/**
 * Documentation navigation manifest. This holds only the *structure* — section
 * metadata (title, icon, blurb) and the ordered list of page slugs. Each page's
 * own title/description are the source of truth in its markdown frontmatter
 * (parsed with gray-matter in `lib/docs/content.ts`).
 *
 * This module is client-safe (data + lucide icons only, no `fs`), so the docs
 * sidebar/search import it directly for structure and icons, while page
 * titles/descriptions are passed down from the server as a serializable map
 * (icons can't cross the RSC boundary, so they stay an import — not a prop).
 *
 * Mirrors the NavItem/NavGroup pattern in `components/layout/app-sidebar.tsx`
 * and reuses the product names + icons from `PRODUCT_LINKS` in
 * `components/layout/header.tsx`.
 */

export const DOCS_BASE = '/docs'

export interface DocSectionConfig {
  slug: string
  title: string
  icon: ComponentType<{ className?: string }>
  description: string
  pageSlugs: string[]
}

/** Page metadata resolved from markdown frontmatter. */
export interface DocMeta {
  title: string
  description?: string
}

// Generic placeholder pages, in order. Slugs and titles are intentionally
// neutral ("page-1" → "Page 1") so the docs aren't locked into specific topic
// names; rename slugs here and update each page's frontmatter title when the
// real structure is decided.
const STANDARD_PAGE_SLUGS = ['page-1', 'page-2', 'page-3', 'page-4']

export const DOCS_SECTIONS: DocSectionConfig[] = [
  {
    slug: 'universal-document-analysis',
    title: 'Universal Document Analysis',
    icon: FileText,
    description: 'AI extraction & automations',
    pageSlugs: STANDARD_PAGE_SLUGS,
  },
  {
    slug: 'form-fill',
    title: 'Form Fill',
    icon: Files,
    description: 'AI form filling from your documents',
    pageSlugs: STANDARD_PAGE_SLUGS,
  },
  {
    slug: 'inkwise',
    title: 'Inkwise',
    icon: PenTool,
    description: 'AI writing with citations',
    pageSlugs: STANDARD_PAGE_SLUGS,
  },
  {
    slug: 'chrona',
    title: 'Chrona',
    icon: Clock,
    description: 'AI time tracking',
    pageSlugs: STANDARD_PAGE_SLUGS,
  },
  {
    slug: 'claw-series',
    title: 'Claw Series',
    icon: Bot,
    description: 'AI digital workers',
    pageSlugs: STANDARD_PAGE_SLUGS,
  },
  {
    slug: 'ai-analytics-suite',
    title: 'AI Analytics Suite',
    icon: BarChart3,
    description: 'Variance, reconciliation, fixed assets & research bots',
    pageSlugs: STANDARD_PAGE_SLUGS,
  },
]

export function docHref(sectionSlug: string, pageSlug: string): string {
  return `${DOCS_BASE}/${sectionSlug}/${pageSlug}`
}

export function findSection(slug: string): DocSectionConfig | null {
  return DOCS_SECTIONS.find((section) => section.slug === slug) ?? null
}

export interface DocSlugPair {
  sectionSlug: string
  pageSlug: string
}

/** Ordered [section, page] pairs — drives generateStaticParams and adjacency. */
export function allDocSlugPairs(): DocSlugPair[] {
  return DOCS_SECTIONS.flatMap((section) =>
    section.pageSlugs.map((pageSlug) => ({ sectionSlug: section.slug, pageSlug })),
  )
}

/** Validate a route slug against the manifest structure. */
export function isValidDocPath(slug: string[] | undefined): slug is [string, string] {
  if (!slug || slug.length !== 2) return false
  const section = findSection(slug[0])
  return Boolean(section && section.pageSlugs.includes(slug[1]))
}

/** Previous/next page slugs in flat manifest order, for the on-page pager. */
export function getAdjacentSlugPairs(
  sectionSlug: string,
  pageSlug: string,
): { prev: DocSlugPair | null; next: DocSlugPair | null } {
  const all = allDocSlugPairs()
  const index = all.findIndex(
    (pair) => pair.sectionSlug === sectionSlug && pair.pageSlug === pageSlug,
  )
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? all[index - 1] : null,
    next: index < all.length - 1 ? all[index + 1] : null,
  }
}

export interface DocCrumb {
  label: string
  href?: string
}

/** Breadcrumb trail: Docs → <Product> → <Page>. */
export function getBreadcrumbs(section: DocSectionConfig, pageTitle: string): DocCrumb[] {
  return [
    { label: 'Docs', href: DOCS_BASE },
    { label: section.title, href: docHref(section.slug, section.pageSlugs[0]!) },
    { label: pageTitle },
  ]
}
