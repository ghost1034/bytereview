'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import type { PdfDocument } from './pdf'

interface PdfPageCanvasProps {
  pdf: PdfDocument
  /** 1-based pdf.js page number */
  pageNumber: number
  className?: string
  /** Rendered when the page has a size; receives the display size in CSS px. */
  overlay?: (size: { width: number; height: number; scale: number }) => React.ReactNode
}

/**
 * Renders one PDF page to a canvas sized to its container width.
 * Lazy: only rasterizes when scrolled near the viewport (IntersectionObserver).
 * Device pixel ratio is capped at 2 to bound memory on multi-page documents.
 */
export function PdfPageCanvas({ pdf, pageNumber, className, overlay }: PdfPageCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = React.useState(false)
  const [containerWidth, setContainerWidth] = React.useState(0)
  const [aspectRatio, setAspectRatio] = React.useState<number | null>(null)
  const [baseWidth, setBaseWidth] = React.useState<number | null>(null)
  const renderTaskRef = React.useRef<{ cancel: () => void } | null>(null)

  // Track container width
  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setContainerWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Lazy visibility
  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true)
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Read the page aspect ratio immediately so layout doesn't jump
  React.useEffect(() => {
    let cancelled = false
    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: 1 })
      setAspectRatio(viewport.height / viewport.width)
      setBaseWidth(viewport.width)
    })
    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber])

  // Render when visible
  React.useEffect(() => {
    if (!visible || containerWidth <= 0) return
    let cancelled = false
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / baseViewport.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: scale * dpr })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${(containerWidth * viewport.height) / viewport.width}px`
      const context = canvas.getContext('2d')
      if (!context) return
      renderTaskRef.current?.cancel()
      const task = page.render({ canvas, canvasContext: context, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch {
        // cancelled render — fine
      }
    })()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
    }
  }, [pdf, pageNumber, visible, containerWidth])

  const displayHeight =
    aspectRatio && containerWidth > 0 ? containerWidth * aspectRatio : undefined

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full overflow-hidden rounded-md border border-border bg-white shadow-sm', className)}
      style={displayHeight ? { height: displayHeight } : { minHeight: 200 }}
      data-esign-page={pageNumber}
    >
      <canvas ref={canvasRef} className="block" />
      {overlay && containerWidth > 0 && displayHeight
        ? overlay({ width: containerWidth, height: displayHeight, scale: baseWidth ? containerWidth / baseWidth : 1 })
        : null}
    </div>
  )
}
