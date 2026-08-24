'use client'

import { useEffect, useState } from 'react'

export type Quality = 'high' | 'low' | 'off'

let cachedWebGLSupport: boolean | undefined

function detectWebGL(): boolean {
  if (cachedWebGLSupport !== undefined) return cachedWebGLSupport

  try {
    const canvas = document.createElement('canvas')
    const context =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')

    cachedWebGLSupport = Boolean(context)

    // Mobile Safari keeps probe contexts alive longer than the detached canvas.
    // Release it explicitly so the actual homepage scenes get the limited contexts.
    if (context && 'getExtension' in context) {
      context.getExtension('WEBGL_lose_context')?.loseContext()
    }

    return cachedWebGLSupport
  } catch {
    cachedWebGLSupport = false
    return cachedWebGLSupport
  }
}

interface Reduced3DState {
  /** False until the client-side capability check has run (avoids SSR mismatch). */
  ready: boolean
  /** WebGL is available — safe to mount a canvas at all. */
  enabled: boolean
  /** Detail budget for the scene. 'off' means render the poster only. */
  quality: Quality
  /** User asked for reduced motion — render a single static frame, no looping. */
  reducedMotion: boolean
}

/**
 * Decides how much 3D to render on this device: combines WebGL availability,
 * prefers-reduced-motion, and a coarse low-power heuristic into one flag the
 * scene components can branch on.
 */
export function useReduced3D(): Reduced3DState {
  const [state, setState] = useState<Reduced3DState>({
    ready: false,
    enabled: false,
    quality: 'off',
    reducedMotion: false,
  })

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const hasWebGL = detectWebGL()
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const lowCores = (navigator.hardwareConcurrency || 4) <= 4
    const lowPower = coarsePointer || lowCores

    let quality: Quality = 'high'
    if (!hasWebGL) quality = 'off'
    else if (lowPower) quality = 'low'

    setState({ ready: true, enabled: hasWebGL, quality, reducedMotion })
  }, [])

  return state
}
