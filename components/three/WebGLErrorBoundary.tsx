'use client'

import * as React from 'react'

interface Props {
  fallback?: React.ReactNode
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches any runtime error thrown while initializing or rendering a WebGL scene
 * (lost context, driver bugs, unsupported features) and renders a static fallback
 * instead of crashing the page.
 */
export class WebGLErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[WebGLErrorBoundary] 3D scene failed to render:', error)
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}
