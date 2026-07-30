'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tasklytic:reduceMotion'

/** Whether the user prefers reduced motion (OS setting or manual toggle). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const read = () => {
      const manual = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      if (manual === '1') return true
      if (manual === '0') return false
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    setReduced(read())

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => setReduced(read())
    mq.addEventListener('change', onMq)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setReduced(read())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      mq.removeEventListener('change', onMq)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return reduced
}

/** Persist manual reduce-motion preference (Appearance settings). */
export function setReducedMotionPreference(on: boolean): void {
  localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
}
