import { promises as fs } from 'fs'
import path from 'path'
import { cache } from 'react'

import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'

import {
  type DocMeta,
  type DocsTree,
  type DocPageEntry,
  DOCS_SECTIONS,
} from './navigation'

/**
 * Server-only loaders for docs markdown (the `fs` import keeps this module
 * server-side). Markdown lives at `content/docs/<section>/<page>.md` with
 * gray-matter frontmatter (`title`, `description`, `order`) followed by the
 * body. A page's slug is its file name (minus `.md`); its order within the
 * section comes from the `order` frontmatter field.
 *
 * Pages are statically generated, so files are read at build time (no runtime
 * fs).
 */

const CONTENT_DIR = path.join(process.cwd(), 'content', 'docs')

// Numeric-aware comparison so "page-2" sorts before "page-10".
const collator = new Intl.Collator(undefined, { numeric: true })

export interface DocPageContent {
  meta: DocMeta
  /** Markdown body with frontmatter stripped. */
  body: string
}

function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

async function readRaw(sectionSlug: string, pageSlug: string): Promise<string | null> {
  const filePath = path.join(CONTENT_DIR, sectionSlug, `${pageSlug}.md`)
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

/** Parse a doc page's frontmatter + body. Returns null if the file is missing. */
export async function readDocPage(
  sectionSlug: string,
  pageSlug: string,
): Promise<DocPageContent | null> {
  const raw = await readRaw(sectionSlug, pageSlug)
  if (raw == null) return null

  const { data, content } = matter(raw)
  return {
    meta: {
      title: typeof data.title === 'string' ? data.title : humanizeSlug(pageSlug),
      description: typeof data.description === 'string' ? data.description : undefined,
    },
    body: content,
  }
}

interface ScannedPage extends DocPageEntry {
  /** Sort key: frontmatter `order`, or +Infinity when absent (sorts last). */
  order: number
}

/**
 * Scan a section's directory for `.md` files and resolve each into an ordered
 * page entry. Slug = file name minus `.md`; title/description/order come from
 * frontmatter (title falls back to a humanized slug). Pages are ordered by the
 * `order` field, with a numeric-aware file-name tiebreak; pages without `order`
 * sort last. A missing/empty directory yields no pages (never throws).
 */
async function listSectionPages(sectionSlug: string): Promise<DocPageEntry[]> {
  const dir = path.join(CONTENT_DIR, sectionSlug)
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files = entries.filter(
    (entry) => entry.isFile() && !entry.name.startsWith('.') && /\.md$/i.test(entry.name),
  )

  const pages: ScannedPage[] = await Promise.all(
    files.map(async (file) => {
      const slug = file.name.replace(/\.md$/i, '')
      const { data } = matter(await fs.readFile(path.join(dir, file.name), 'utf8'))
      return {
        slug,
        title: typeof data.title === 'string' ? data.title : humanizeSlug(slug),
        description: typeof data.description === 'string' ? data.description : undefined,
        order: typeof data.order === 'number' ? data.order : Number.POSITIVE_INFINITY,
      }
    }),
  )

  pages.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    // Tiebreak on slug (= file name minus `.md`), numeric-aware.
    return collator.compare(a.slug, b.slug)
  })

  // Strip the sort-only `order` key from the serializable entry.
  return pages.map(({ slug, title, description }) => ({ slug, title, description }))
}

/**
 * Build the docs tree: section metadata (title/blurb/order) from the manifest,
 * each with its ordered, file-derived pages. Plain serializable data (no icons)
 * so it can cross the RSC boundary as a prop. Wrapped in React `cache()` so the
 * repeated calls across layout/page/metadata dedupe within a build.
 */
export const loadDocsTree = cache(async (): Promise<DocsTree> => {
  return Promise.all(
    DOCS_SECTIONS.map(async (section) => ({
      slug: section.slug,
      title: section.title,
      description: section.description,
      pages: await listSectionPages(section.slug),
    })),
  )
})

export interface DocHeading {
  id: string
  text: string
  level: 2 | 3
}

// Strip the inline markdown that wouldn't survive into a heading's text content,
// so slugger input matches what rehype-slug sees in the rendered DOM.
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → label
    .replace(/[*_~]/g, '') // emphasis markers
    .trim()
}

/**
 * Extract `##`/`###` headings for the table of contents. Uses the same
 * `github-slugger` that `rehype-slug` uses internally — including its
 * duplicate-heading disambiguation — so TOC ids always match the anchors
 * stamped onto the rendered headings. Skips fenced code blocks.
 */
export function extractHeadings(markdown: string): DocHeading[] {
  const slugger = new GithubSlugger()
  const headings: DocHeading[] = []
  let inFence = false

  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue

    const level = match[1].length as 2 | 3
    const text = stripInlineMarkdown(match[2])
    if (!text) continue

    headings.push({ id: slugger.slug(text), text, level })
  }

  return headings
}
