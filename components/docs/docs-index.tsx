import { PageHeader } from '@/components/ui/page-header'
import { ProductCard } from '@/components/marketing/product-card'
import { DOCS_SECTIONS, docHref } from '@/lib/docs/navigation'

/** The /docs landing page: a card grid linking into each product's docs. */
export function DocsIndex() {
  return (
    <div>
      <PageHeader
        eyebrow="Documentation"
        title="CPAAutomation Docs"
        description="Guides and reference for every product in the CPAAutomation suite. Pick a product to get started."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {DOCS_SECTIONS.map((section) => (
          <ProductCard
            key={section.slug}
            icon={section.icon}
            name={section.title}
            description={section.description}
            href={docHref(section.slug, section.pageSlugs[0]!)}
          />
        ))}
      </div>
    </div>
  )
}
