'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { type DocsTree, DOCS_BASE, docHref, findSection } from '@/lib/docs/navigation'
import { cn } from '@/lib/utils'

import { DocsSearch } from './docs-search'

interface DocsNavProps {
  sections: DocsTree
  onNavigate?: () => void
}

/** The collapsible product → page tree. Shared by the desktop rail and mobile sheet. */
function DocsNav({ sections, onNavigate }: DocsNavProps) {
  const pathname = usePathname() ?? ''

  return (
    <nav className="space-y-1" aria-label="Documentation">
      {sections.map((section) => {
        const Icon = findSection(section.slug)?.icon
        const sectionActive = pathname.startsWith(`${DOCS_BASE}/${section.slug}`)
        return (
          <Collapsible key={section.slug} defaultOpen={sectionActive}>
            <CollapsibleTrigger className="group/collapsible flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
              {Icon && <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden />}
              <span className="flex-1 text-left">{section.title}</span>
              <ChevronRight
                className="size-4 shrink-0 text-foreground-subtle transition-transform group-data-[state=open]/collapsible:rotate-90"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-0.5 space-y-0.5 pl-4">
              {section.pages.map((page) => {
                const href = docHref(section.slug, page.slug)
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md border-l border-border py-1.5 pl-3 text-sm text-foreground-muted transition-colors hover:text-foreground',
                      active && 'border-primary bg-accent font-medium text-foreground',
                    )}
                  >
                    {page.title}
                  </Link>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </nav>
  )
}

/** Docs navigation: a sticky desktop rail plus a mobile sheet, both fronted by search. */
export function DocsSidebar({ sections }: { sections: DocsTree }) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <>
      {/* Desktop rail */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(var(--header-height)+1.5rem)] space-y-4">
          <DocsSearch sections={sections} />
          <DocsNav sections={sections} />
        </div>
      </div>

      {/* Mobile trigger + sheet */}
      <div className="lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" aria-hidden />
              Browse docs
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-full max-w-xs overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Documentation</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <DocsSearch sections={sections} />
              <DocsNav sections={sections} onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
