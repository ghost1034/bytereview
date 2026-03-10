import type { ReactNode } from 'react'

import { InkwiseModuleNav } from '@/components/inkwise/inkwise-module-nav'

export default function InkwiseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-50 via-white to-cyan-50 shadow-sm">
        <div className="flex flex-col gap-4 p-8">
          <div className="space-y-2">
            <div className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              CPAAutomation.ai Module
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Inkwise</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Draft grounded writing from your source library, manage reusable templates, and keep document-backed chat in one workspace.
            </p>
          </div>
          <InkwiseModuleNav />
        </div>
      </section>

      {children}
    </div>
  )
}
