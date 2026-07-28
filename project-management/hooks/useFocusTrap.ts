'use client'



/**

 * Focus trap for modal dialogs — keeps Tab/Shift+Tab within the container.

 */

import { useEffect, type RefObject } from 'react'



const FOCUSABLE =

  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'



export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>): void {

  useEffect(() => {

    if (!active || !containerRef.current) return



    const root = containerRef.current

    const previouslyFocused = document.activeElement as HTMLElement | null



    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))



    requestAnimationFrame(() => {

      const first = focusables()[0]

      first?.focus()

    })



    const onKeyDown = (e: KeyboardEvent) => {

      if (e.key !== 'Tab') return

      const nodes = focusables()

      if (nodes.length === 0) return

      const first = nodes[0]

      const last = nodes[nodes.length - 1]

      if (e.shiftKey && document.activeElement === first) {

        e.preventDefault()

        last.focus()

      } else if (!e.shiftKey && document.activeElement === last) {

        e.preventDefault()

        first.focus()

      }

    }



    root.addEventListener('keydown', onKeyDown)

    return () => {

      root.removeEventListener('keydown', onKeyDown)

      previouslyFocused?.focus?.()

    }

  }, [active, containerRef])

}


