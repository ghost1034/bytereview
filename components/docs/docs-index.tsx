import { PageHeader } from '@/components/ui/page-header'
import { ProductCard } from '@/components/marketing/product-card'
import { type DocsTree, DOCS_BASE, docHref, findSection } from '@/lib/docs/navigation'

/** The /docs landing page: a card grid linking into each product's docs. */
export function DocsIndex({ sections }: { sections: DocsTree }) {
  return (
    <div>
      <PageHeader
        eyebrow="Documentation"
        title="CPAAutomation Docs"
        description="Guides and reference for every product in the CPAAutomation suite (Tasklytic coming soon). Pick a product to get started."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => {
          const config = findSection(section.slug)
          if (!config) return null
          const firstPage = section.pages[0]
          const href = firstPage
            ? docHref(section.slug, firstPage.slug)
            : `${DOCS_BASE}/${section.slug}`
          return (
            <ProductCard
              key={section.slug}
              icon={config.icon}
              name={section.title}
              description={section.description}
              href={href}
            />
          )
        })}
      </div>
    </div>
  )
}
