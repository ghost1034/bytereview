'use client'

/** Internal `/internal/eval` admin page — seven evaluation tenant fixtures. */
import { EvaluationTenantsPanel } from './EvaluationTenantsPanel'
import { usePageMeta } from '../../hooks/usePageMeta'

export function EvalTenantsPage() {
  usePageMeta({ breadcrumbs: [{ label: 'Internal eval tenants' }] })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans text-2xl">Evaluation tenants</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          Sales, CS, and Support fixtures — not visible to customers.
        </p>
      </div>
      <EvaluationTenantsPanel />
    </div>
  )
}
