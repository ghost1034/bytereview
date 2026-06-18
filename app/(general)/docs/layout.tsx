import type { ReactNode } from 'react'

import { DocsSidebar } from '@/components/docs/docs-sidebar'
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
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <aside className="mb-6 lg:mb-0">
          <DocsSidebar sections={sections} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
