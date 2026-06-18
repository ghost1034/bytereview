import { promises as fs } from 'fs'
import path from 'path'

import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'

import {
  type DocMeta,
  DOCS_SECTIONS,
  docHref,
} from './navigation'

/**
 * Server-only loaders for docs markdown (the `fs` import keeps this module
 * server-side). Markdown lives at `content/docs/<section>/<page>.md` with
 * gray-matter frontmatter (`title`, `description`) followed by the body.
 *
 * Pages are statically generated, so files are read at build time (no runtime
 * fs).
 */

const CONTENT_DIR = path.join(process.cwd(), 'content', 'docs')

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

/**
 * Build the page-metadata map (keyed by href) the client nav/search need. Reads
 * frontmatter for every page in the manifest. Runs at build time during static
 * generation.
 */
export async function loadDocsPageMeta(): Promise<Record<string, DocMeta>> {
  const entries = await Promise.all(
    DOCS_SECTIONS.flatMap((section) =>
      section.pageSlugs.map(async (pageSlug) => {
        const href = docHref(section.slug, pageSlug)
        const page = await readDocPage(section.slug, pageSlug)
        return [href, page?.meta ?? { title: humanizeSlug(pageSlug) }] as const
      }),
    ),
  )
  return Object.fromEntries(entries)
}

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
