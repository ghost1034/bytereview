'use client'

import { useEffect, useRef, useState } from 'react'

interface Options {
  /** Expand the viewport bounds so the canvas mounts slightly before it scrolls in. */
  rootMargin?: string
  threshold?: number
}

/**
 * Tracks whether the ref'd element is within (or near) the viewport.
 * Used to pause WebGL rendering when a canvas scrolls offscreen and to defer
 * mounting heavy canvases until they're close to view.
 */
export function useInViewport<T extends HTMLElement = HTMLDivElement>(
  options?: Options,
) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  const [hasEntered, setHasEntered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      setHasEntered(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setInView(entry.isIntersecting)
        if (entry.isIntersecting) setHasEntered(true)
      },
      {
        rootMargin: options?.rootMargin ?? '200px',
        threshold: options?.threshold ?? 0,
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [options?.rootMargin, options?.threshold])

  return { ref, inView, hasEntered }
}
