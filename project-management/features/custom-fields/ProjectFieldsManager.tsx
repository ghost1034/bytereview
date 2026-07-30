'use client'

/** ProjectFieldsManager — project settings custom fields tab (order, library, create). */
import { useMemo, useState } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore } from '../../stores/entities'
import { useProjectFieldPrefsStore } from '../../stores/projectFieldPrefs'
import {
  addFieldToProject,
  removeFieldFromProject,
  reorderProjectFields,
} from '../../lib/customFields/customFieldActions'
import { filterActiveFields } from '../../lib/customFields/fieldConfig'
import { fieldTypeLabel } from '../../lib/customFields/fieldTypes'
import { FieldEditorDialog } from './FieldEditorDialog'
import { FieldLibraryPage } from './FieldLibraryPage'
import { FieldTypeIcon } from './FieldTypeIcon'
import { RecommendedFieldsPanel } from './RecommendedFieldsPanel'
import { useProjectFields } from './useProjectFields'

type Props = { projectId: string }

export function ProjectFieldsManager({ projectId }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const project = useProjectsStore((s) => s.getById(projectId))
  const { fields, workspaceLibrary } = useProjectFields(project)
  const setShowOnCard = useProjectFieldPrefsStore((s) => s.setShowOnCard)
  const getShowOnCard = useProjectFieldPrefsStore((s) => s.getShowOnCard)
  const [editorOpen, setEditorOpen] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const libraryFiltered = useMemo(() => {
    const q = librarySearch.trim().toLowerCase()
    const attached = new Set(project?.customFieldIds ?? [])
    return filterActiveFields(workspaceLibrary).filter(
      (f) =>
        f.isGlobal &&
        !attached.has(f.id) &&
        (!q || f.name.toLowerCase().includes(q) || fieldTypeLabel(f.type).toLowerCase().includes(q))
    )
  }, [librarySearch, project?.customFieldIds, workspaceLibrary])

  if (!project || !currentUserId) return null

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = fields.map((f) => f.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    await reorderProjectFields(projectId, next)
    setDragId(null)
  }

  return (
    <div className="space-y-6">
      <RecommendedFieldsPanel workspaceId={project.workspaceId} projectId={projectId} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg">Project fields</h3>
            <Button size="sm" onClick={() => setEditorOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Create field
            </Button>
          </div>
          {fields.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              No fields on this project yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {fields.map((field) => (
                <li
                  key={field.id}
                  draggable
                  onDragStart={() => setDragId(field.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void onDrop(field.id)}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab" style={{ color: 'var(--ink-faint)' }} />
                  <FieldTypeIcon type={field.type} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{field.name}</span>
                  <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
                    <Switch
                      checked={getShowOnCard(projectId, field.id)}
                      onCheckedChange={(v) => setShowOnCard(projectId, field.id, Boolean(v))}
                    />
                    Card
                  </label>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-[var(--bg-muted)]"
                    title="Remove from project"
                    onClick={() => void removeFieldFromProject(projectId, field.id)}
                  >
                    <X className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-3 font-serif text-lg">Field library</h3>
          <Input
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Search library…"
            className="mb-3"
          />
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {libraryFiltered.map((field) => (
              <li
                key={field.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <FieldTypeIcon type={field.type} />
                  {field.name}
                </span>
                <Button size="sm" variant="outline" onClick={() => void addFieldToProject(projectId, field.id)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <FieldEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        workspaceId={project.workspaceId}
        userId={currentUserId}
        projectId={projectId}
        defaultGlobal={false}
        onSaved={async (field) => {
          await addFieldToProject(projectId, field.id)
        }}
      />
    </div>
  )
}

/** Re-export library page for workspace settings route. */
export { FieldLibraryPage as FieldsTab }
