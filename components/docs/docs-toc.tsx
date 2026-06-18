'use client'

import { useEffect, useState } from 'react'

import type { DocHeading } from '@/lib/docs/content'
import { cn } from '@/lib/utils'

/**
 * "On this page" right rail. Tracks the heading currently in view with an
 * IntersectionObserver (scroll-spy). Headings come pre-extracted from the
 * server (`extractHeadings`); ids match the anchors stamped by DocsContent.
 */
export function DocsToc({ headings }: { headings: DocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (headings.length === 0) return

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      // Trigger once a heading clears the sticky header, ignore the bottom 70%.
      { rootMargin: '-112px 0px -70% 0px', threshold: [0, 1] },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  return (
    <nav aria-label="On this page" className="space-y-3 text-sm">
      <p className="font-medium text-foreground">On this page</p>
      <ul className="space-y-1.5">
        {headings.map((heading) => (
          <li key={heading.id} className={cn(heading.level === 3 && 'pl-3')}>
            <a
              href={`#${heading.id}`}
              className={cn(
                '-ml-px block border-l border-border py-0.5 pl-3 text-foreground-muted transition-colors hover:text-foreground',
                activeId === heading.id && 'border-primary font-medium text-foreground',
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
