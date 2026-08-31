import type { ReactNode } from 'react'

import { PublicDocsSidebar } from '@/components/public-site/docs'
import { loadDocsTree } from '@/lib/docs/content'

/**
 * Docs layout. Renders inside the marketing chrome (Header/Footer from
 * `app/(general)/layout.tsx`) and adds the docs sidebar + content grid. Scans
 * the docs content tree once (at build time) and passes the ordered, file-
 * derived sections/pages to the client sidebar + search.
 */
export default async function DocsLayout({ children }: { children: ReactNode }) {
  const sections = await loadDocsTree()

  return (
    <div className="ps-doc-shell">
      <div className="ps-container ps-doc-shell__grid">
        <PublicDocsSidebar sections={sections} />
        <div className="ps-doc-shell__content">{children}</div>
      </div>
    </div>
  )
}
