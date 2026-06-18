'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { type DocsTree, docHref, findSection } from '@/lib/docs/navigation'
import { cn } from '@/lib/utils'

interface DocsSearchProps {
  /** Ordered, file-derived sections + pages, resolved on the server. */
  sections: DocsTree
  className?: string
}

/**
 * Cmd/Ctrl+K documentation search. Self-contained: renders both the trigger
 * button and the command palette. Section icons come from the manifest; the
 * page tree (titles/descriptions/order) is file-derived and passed in via
 * `sections`. cmdk handles the fuzzy filtering. Mirrors the workspace palette
 * in `dashboard-shell.tsx`.
 */
export function DocsSearch({ sections, className }: DocsSearchProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = React.useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground-muted shadow-xs transition-colors hover:border-border-strong hover:text-foreground',
          className,
        )}
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search docs…</span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-surface-muted px-1.5 font-mono text-[10px] text-foreground-subtle sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search documentation…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {sections.map((section) => {
            const Icon = findSection(section.slug)?.icon
            return (
              <CommandGroup key={section.slug} heading={section.title}>
                {section.pages.map((page) => {
                  const href = docHref(section.slug, page.slug)
                  return (
                    <CommandItem
                      key={href}
                      value={`${section.title} ${page.title} ${page.description ?? ''}`}
                      onSelect={() => go(href)}
                    >
                      {Icon && <Icon className="mr-2 size-4 text-foreground-muted" />}
                      <span className="flex flex-col">
                        <span>{page.title}</span>
                        {page.description && (
                          <span className="text-xs text-foreground-subtle">
                            {page.description}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}
