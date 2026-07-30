'use client'

/**
 * Tasklytic theme — light / dark / system with tasklytic:theme persistence.
 * Applies `dark` class on the .tasklytic-root element.
 */
import { useCallback, useEffect, useState } from 'react'

export type TasklyticTheme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'tasklytic:theme'

function readStoredTheme(): TasklyticTheme {
  if (typeof window === 'undefined') return 'system'
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

function resolveDark(theme: TasklyticTheme): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTasklyticTheme(rootRef?: { current: HTMLElement | null }) {
  const [theme, setThemeState] = useState<TasklyticTheme>('system')
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    setIsDark(resolveDark(stored))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme)
    setIsDark(resolveDark(theme))
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setIsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    const root = rootRef?.current ?? document.querySelector('.tasklytic-root')
    if (!root) return
    root.classList.toggle('dark', isDark)
  }, [isDark, rootRef])

  const setTheme = useCallback((next: TasklyticTheme) => setThemeState(next), [])

  const cycleTheme = useCallback(() => {
    setThemeState((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'))
  }, [])

  const toggleDark = useCallback(() => {
    setThemeState((t) => {
      const dark = resolveDark(t)
      return dark ? 'light' : 'dark'
    })
  }, [])

  return { theme, isDark, setTheme, cycleTheme, toggleDark }
}
