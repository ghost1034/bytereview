'use client'

/** Recommended fields panel for project field manager. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore } from '../../stores/entities'
import {
  addRecommendedFieldToProject,
  RECOMMENDED_FIELD_SPECS,
  type RecommendedFieldSpec,
} from '../../lib/customFields/seedRecommendedFields'
import { getProjectFields } from './useProjectFields'
import { fieldTypeLabel } from '../../lib/customFields/fieldTypes'

type Props = {
  workspaceId: string
  projectId: string
  canCreateGlobal?: boolean
}

export function RecommendedFieldsPanel({ workspaceId, projectId, canCreateGlobal = true }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const project = useProjectsStore((s) => s.getById(projectId))
  const [busy, setBusy] = useState<string | null>(null)

  if (!project || !currentUserId) return null

  const attached = new Set(getProjectFields(project).map((f) => f.name))

  const add = async (spec: RecommendedFieldSpec) => {
    setBusy(spec.name)
    try {
      await addRecommendedFieldToProject(workspaceId, currentUserId, projectId, spec, canCreateGlobal)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-muted))' }}>
      <h3 className="text-sm font-semibold">Recommended fields</h3>
      <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Common fields used by high-performing teams.
      </p>
      <ul className="mt-3 space-y-2">
        {RECOMMENDED_FIELD_SPECS.map((spec) => {
          const added = attached.has(spec.name)
          return (
            <li key={spec.name} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <span className="font-medium">{spec.name}</span>
                <span className="ml-2 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {fieldTypeLabel(spec.type)}
                </span>
              </div>
              <Button
                size="sm"
                variant={added ? 'secondary' : 'outline'}
                disabled={added || busy === spec.name}
                onClick={() => void add(spec)}
              >
                {added ? 'Added' : 'Add'}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
