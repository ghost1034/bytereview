import type { ReactNode } from 'react'

import { InkwiseModuleNav } from '@/components/inkwise/inkwise-module-nav'
import { ProductTourButton } from '@/components/tour/product-tour-button'

export default function InkwiseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-var(--header-height)-2rem)] flex-col gap-4">
      <section className="sticky top-4 z-20 overflow-hidden rounded-3xl border bg-white/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Inkwise Workspace
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inkwise</h1>
              <p className="text-sm text-slate-500">Multimodal AI-assisted writing</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ProductTourButton tourId="inkwise" />
            <InkwiseModuleNav />
          </div>
        </div>
      </section>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
