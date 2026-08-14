'use client'

/** FormsPage — workspace forms list with create and full editor. */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useFormsStore, useProjectsStore } from '../../stores/entities'
import { CreateFormDialog } from './CreateFormDialog'
import { FormEditor } from './FormEditor'
import { FormListItem } from './FormListItem'

/** Main workspace forms page — list, create, and edit intake forms. */
export function FormsPage() {
  const { workspaceId } = useWorkspaceContext()
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])
  const forms = useFormsStore((s) => s.list().filter((f) => projectIds.has(f.projectId)))
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(forms[0]?.id ?? null)
  const selected = forms.find((f) => f.id === selectedId)

  usePageMeta({ breadcrumbs: workspaceId ? [
    { label: 'Tasklytic', href: `/dashboard/project-management/w/${workspaceId}/home` },
    { label: 'Forms' },
  ] : [] })

  if (!workspaceId) return null

  return (
    <div className="space-y-4" data-tour-page="forms">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Forms</h1>
        <Button className="tl-btn-primary gap-2 border-0" onClick={() => setCreateOpen(true)} disabled={!projects.length}>
          <Plus className="h-4 w-4" />
          New form
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="tl-card p-8 text-center shadow-paper-sm">
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Create a project first to add forms.</p>
        </div>
      ) : forms.length === 0 ? (
        <div className="tl-card p-8 text-center shadow-paper-sm">
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            No forms yet. Create one to collect structured task requests.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-2">
            {forms.map((form) => (
              <FormListItem
                key={form.id}
                form={form}
                selected={selectedId === form.id}
                onSelect={() => setSelectedId(form.id)}
              />
            ))}
          </aside>
          <section className="min-w-0">
            {selected ? <FormEditor form={selected} /> : null}
          </section>
        </div>
      )}

      <CreateFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  )
}
