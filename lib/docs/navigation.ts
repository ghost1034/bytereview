import type { ComponentType } from 'react'
import { BarChart3, Bot, Clock, FileSignature, FileText, Files, PenTool } from 'lucide-react'

/**
 * Documentation navigation manifest. This holds only the *section* structure —
 * section metadata (title, icon, blurb) and their order. The pages within a
 * section, their slugs, and their order are the source of truth on disk:
 * markdown files under `content/docs/<section>/`, scanned at build time by
 * `loadDocsTree()` in `lib/docs/content.ts`. Each page's title/description come
 * from its frontmatter; its order comes from the frontmatter `order` field.
 *
 * This module is client-safe (data + lucide icons + pure functions, no `fs`),
 * so the docs sidebar/search import it directly for section icons. The page
 * tree (plain, serializable data — no icons) is loaded on the server and passed
 * down as a prop; icons can't cross the RSC boundary, so they stay an import,
 * looked up by section slug via `findSection`.
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
}

/** Page metadata resolved from markdown frontmatter. */
export interface DocMeta {
  title: string
  description?: string
}

/** A single page within a section, resolved from its markdown file. */
export interface DocPageEntry {
  slug: string
  title: string
  description?: string
}

/** A section plus its ordered, file-derived pages — the serializable runtime tree. */
export interface DocsTreeSection {
  slug: string
  title: string
  description: string
  pages: DocPageEntry[]
}

export type DocsTree = DocsTreeSection[]

export const DOCS_SECTIONS: DocSectionConfig[] = [
  {
    slug: 'universal-document-analysis',
    title: 'Universal Document Analysis',
    icon: FileText,
    description: 'AI extraction & automations',
  },
  {
    slug: 'form-fill',
    title: 'Form Fill',
    icon: Files,
    description: 'AI form filling from your documents',
  },
  {
    slug: 'inkwise',
    title: 'Inkwise',
    icon: PenTool,
    description: 'AI writing with citations',
  },
  {
    slug: 'e-signature',
    title: 'E-Signature (beta)',
    icon: FileSignature,
    description: 'Send, sign, and verify documents',
  },
  {
    slug: 'chrona',
    title: 'Chrona',
    icon: Clock,
    description: 'AI time tracking',
  },
  {
    slug: 'claw-series',
    title: 'Claw Series',
    icon: Bot,
    description: 'AI digital workers',
  },
  {
    slug: 'ai-analytics-suite',
    title: 'AI Analytics Suite',
    icon: BarChart3,
    description: 'Variance, reconciliation, fixed assets & research bots',
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

/**
 * Ordered [section, page] pairs from the loaded tree — drives
 * generateStaticParams and the on-page pager's adjacency.
 */
export function allDocSlugPairs(tree: DocsTree): DocSlugPair[] {
  return tree.flatMap((section) =>
    section.pages.map((page) => ({ sectionSlug: section.slug, pageSlug: page.slug })),
  )
}

/** Validate a route slug against the loaded tree structure. */
export function isValidDocPath(
  tree: DocsTree,
  slug: string[] | undefined,
): slug is [string, string] {
  if (!slug || slug.length !== 2) return false
  const section = tree.find((s) => s.slug === slug[0])
  return Boolean(section && section.pages.some((page) => page.slug === slug[1]))
}

/** Previous/next page slugs in flat tree order, for the on-page pager. */
export function getAdjacentSlugPairs(
  tree: DocsTree,
  sectionSlug: string,
  pageSlug: string,
): { prev: DocSlugPair | null; next: DocSlugPair | null } {
  const all = allDocSlugPairs(tree)
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

/**
 * Breadcrumb trail: Docs → <Product> → <Page>. The product crumb links to the
 * section's first page; if the section has no pages it links to the section
 * root instead.
 */
export function getBreadcrumbs(
  section: DocSectionConfig,
  firstPageSlug: string | undefined,
  pageTitle: string,
): DocCrumb[] {
  const sectionHref = firstPageSlug
    ? docHref(section.slug, firstPageSlug)
    : `${DOCS_BASE}/${section.slug}`
  return [
    { label: 'Docs', href: DOCS_BASE },
    { label: section.title, href: sectionHref },
    { label: pageTitle },
  ]
}
