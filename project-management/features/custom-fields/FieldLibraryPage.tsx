'use client'

/** FieldLibraryPage — browse and manage workspace custom field library. */
import { useMemo, useState } from 'react'
import { ArrowDownAZ, Plus, Search, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useUsersStore } from '../../stores/entities'
import {
  addFieldToProject,
  archiveField,
  countProjectsUsingField,
  countTasksUsingField,
  deleteField,
} from '../../lib/customFields/customFieldActions'
import { isFieldArchived } from '../../lib/customFields/fieldConfig'
import { fieldTypeLabel } from '../../lib/customFields/fieldTypes'
import { FieldEditorDialog } from './FieldEditorDialog'
import { FieldTypeIcon } from './FieldTypeIcon'
import type { CustomField, Project } from '../../types'

type Props = {
  project?: Project
  onAddToProject?: (fieldId: string) => void
}

type SortKey = 'name' | 'type' | 'usage'

export function FieldLibraryPage({ project, onAddToProject }: Props = {}) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const fields = useCustomFieldsStore((s) =>
    s.list().filter((f) => f.workspaceId === workspaceId && !isFieldArchived(f))
  )
  const users = useUsersStore((s) => s.list())
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editField, setEditField] = useState<CustomField | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null)

  usePageMeta({
    breadcrumbs: workspaceId ? [
      { label: 'Tasklytic', href: `/dashboard/project-management/w/${workspaceId}/home` },
      { label: 'Settings', href: `/dashboard/project-management/w/${workspaceId}/settings` },
      { label: project ? 'Custom fields' : 'Field library' },
    ] : [],
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = fields
    if (q) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          fieldTypeLabel(f.type).toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'type') return fieldTypeLabel(a.type).localeCompare(fieldTypeLabel(b.type))
      if (sortKey === 'usage') return countProjectsUsingField(b.id) - countProjectsUsingField(a.id)
      return a.name.localeCompare(b.name)
    })
  }, [fields, search, sortKey])

  const attach = async (fieldId: string) => {
    if (project) {
      await addFieldToProject(project.id, fieldId)
      onAddToProject?.(fieldId)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await deleteField(deleteTarget.id)
    setDeleteTarget(null)
  }

  if (!workspaceId || !currentUserId) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">{project ? 'Add fields' : 'Field library'}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
            {project
              ? `Add global fields from ${workspace?.name ?? 'workspace'} to ${project.name}.`
              : 'Create and manage custom fields for your workspace.'}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditField(undefined)
            setEditorOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Create field
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSortKey((k) => (k === 'name' ? 'type' : k === 'type' ? 'usage' : 'name'))
          }
        >
          <ArrowDownAZ className="mr-1 h-4 w-4" />
          Sort: {sortKey}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="grid grid-cols-[1.2fr_1fr_0.7fr_1fr_0.6fr_0.8fr] gap-2 border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}
        >
          <span>Name</span>
          <span>Type</span>
          <span>Used in</span>
          <span>Created by</span>
          <span>Notify</span>
          <span className="text-right">Actions</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
            No fields yet. Create one to get started.
          </p>
        ) : (
          filtered.map((field) => {
            const creator = users.find((u) => u.id === field.createdBy)
            const onProject = project?.customFieldIds.includes(field.id)
            const usage = countProjectsUsingField(field.id)
            return (
              <div
                key={field.id}
                className="grid grid-cols-[1.2fr_1fr_0.7fr_1fr_0.6fr_0.8fr] items-center gap-2 border-b px-4 py-3 text-sm last:border-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 truncate text-left font-medium hover:underline"
                  onClick={() => {
                    setEditField(field)
                    setEditorOpen(true)
                  }}
                >
                  <FieldTypeIcon type={field.type} />
                  <span className="truncate">{field.name}</span>
                  {field.isGlobal ? (
                    <span className="text-xs font-normal" style={{ color: 'var(--ink-muted)' }}>
                      Global
                    </span>
                  ) : null}
                </button>
                <span style={{ color: 'var(--ink-secondary)' }}>{fieldTypeLabel(field.type)}</span>
                <span style={{ color: 'var(--ink-muted)' }}>{usage} project(s)</span>
                <span className="truncate" style={{ color: 'var(--ink-secondary)' }}>
                  {creator?.name ?? '—'}
                </span>
                <span style={{ color: 'var(--ink-muted)' }}>{field.notify ? 'Yes' : '—'}</span>
                <div className="flex justify-end gap-1">
                  {project ? (
                    <Button
                      size="sm"
                      variant={onProject ? 'secondary' : 'outline'}
                      disabled={onProject}
                      onClick={() => void attach(field.id)}
                    >
                      {onProject ? 'Added' : 'Add'}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void archiveField(field.id)}>
                        Archive
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(field)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <FieldEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        workspaceId={workspaceId}
        userId={currentUserId}
        field={editField}
        projectId={project?.id}
        onSaved={() => setEditField(undefined)}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="tl-dialog-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Used in {deleteTarget ? countProjectsUsingField(deleteTarget.id) : 0} project(s) and{' '}
              {deleteTarget ? countTasksUsingField(deleteTarget.id) : 0} task value(s). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete everywhere</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
