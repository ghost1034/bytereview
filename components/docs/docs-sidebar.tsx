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
import { type DocMeta, DOCS_BASE, DOCS_SECTIONS, docHref } from '@/lib/docs/navigation'
import { cn } from '@/lib/utils'

import { DocsSearch } from './docs-search'

interface DocsNavProps {
  pageMeta: Record<string, DocMeta>
  onNavigate?: () => void
}

/** The collapsible product → page tree. Shared by the desktop rail and mobile sheet. */
function DocsNav({ pageMeta, onNavigate }: DocsNavProps) {
  const pathname = usePathname() ?? ''

  return (
    <nav className="space-y-1" aria-label="Documentation">
      {DOCS_SECTIONS.map((section) => {
        const Icon = section.icon
        const sectionActive = pathname.startsWith(`${DOCS_BASE}/${section.slug}`)
        return (
          <Collapsible key={section.slug} defaultOpen={sectionActive}>
            <CollapsibleTrigger className="group/collapsible flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
              <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden />
              <span className="flex-1 text-left">{section.title}</span>
              <ChevronRight
                className="size-4 shrink-0 text-foreground-subtle transition-transform group-data-[state=open]/collapsible:rotate-90"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-0.5 space-y-0.5 pl-4">
              {section.pageSlugs.map((pageSlug) => {
                const href = docHref(section.slug, pageSlug)
                const active = pathname === href
                const title = pageMeta[href]?.title ?? pageSlug
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
                    {title}
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
export function DocsSidebar({ pageMeta }: { pageMeta: Record<string, DocMeta> }) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <>
      {/* Desktop rail */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(var(--header-height)+1.5rem)] space-y-4">
          <DocsSearch pageMeta={pageMeta} />
          <DocsNav pageMeta={pageMeta} />
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
              <DocsSearch pageMeta={pageMeta} />
              <DocsNav pageMeta={pageMeta} onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
