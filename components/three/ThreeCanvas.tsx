'use client'

import * as React from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents, Preload } from '@react-three/drei'

import { cn } from '@/lib/utils'
import { WebGLErrorBoundary } from './WebGLErrorBoundary'
import { useInViewport } from './useInViewport'

interface ThreeCanvasProps {
  children: React.ReactNode
  /** Static layer rendered behind the canvas (poster / gradient). Always visible. */
  fallback?: React.ReactNode
  className?: string
  /** 'always' = continuous render (auto-paused offscreen). 'demand' = render on invalidate. */
  frameloop?: 'always' | 'demand'
  dpr?: [number, number]
  camera?: { position?: [number, number, number]; fov?: number }
  /** Skip the canvas entirely (e.g. WebGL unavailable) — only the fallback renders. */
  disabled?: boolean
  /** How far outside the viewport to mount the canvas. */
  rootMargin?: string
}

/**
 * Shared wrapper for every decorative 3D layer on the site. Bakes in the
 * non-negotiables: DPR cap, adaptive DPR/events, intersection-pausing,
 * error fallback, and the decorative/aria-hidden/pointer-events-none semantics.
 *
 * The canvas mounts only once its container nears the viewport, and its frameloop
 * drops to 'never' whenever it scrolls offscreen so only the visible scene renders.
 */
export function ThreeCanvas({
  children,
  fallback = null,
  className,
  frameloop = 'always',
  dpr = [1, 1.75],
  camera,
  disabled = false,
  rootMargin = '300px',
}: ThreeCanvasProps) {
  const { ref, inView, hasEntered } = useInViewport<HTMLDivElement>({ rootMargin })

  return (
    <div
      ref={ref}
      aria-hidden="true"
      role="presentation"
      className={cn('pointer-events-none absolute inset-0', className)}
    >
      {fallback}
      {!disabled && hasEntered && (
        <WebGLErrorBoundary fallback={null}>
          <Canvas
            frameloop={inView ? frameloop : 'never'}
            dpr={dpr}
            camera={{
              position: camera?.position ?? [0, 0, 6],
              fov: camera?.fov ?? 45,
            }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            {children}
            <AdaptiveDpr pixelated />
            <AdaptiveEvents />
            <Preload all />
          </Canvas>
        </WebGLErrorBoundary>
      )}
    </div>
  )
}
