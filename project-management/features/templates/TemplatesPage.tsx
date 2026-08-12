'use client'

/**
 * TemplatesPage — gallery, saved templates, and template management.
 */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useTeamsStore } from '../../stores/entities'
import {
  TEMPLATE_LIBRARY,
  getCuratedTemplateById,
  templatesByCategory,
} from '../../lib/templates/templateLibrary'
import type { ProjectTemplate, ProjectView } from '../../types'
import type { TemplateCategory } from '../../lib/templates/types'
import { TemplateCard } from './TemplateCard'
import { TemplateFilters } from './TemplateFilters'
import { TemplatePreviewDialog } from './TemplatePreviewDialog'
import { CreateTemplateModal } from './CreateTemplateModal'
import { SavedTemplatesPanel } from './SavedTemplatesPanel'
import { useTemplateInstantiate } from './useTemplateInstantiate'

const PROJECT_VIEWS: ProjectView[] = ['list', 'board', 'calendar', 'timeline', 'gantt']

export function TemplatesPage() {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const teamId = useTeamsStore((s) => s.list().find((t) => t.workspaceId === workspaceId)?.id)
  const { useTemplate: instantiateTemplate, loadingId } = useTemplateInstantiate(workspaceId ?? '')

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTemplate, setEditTemplate] = useState<ProjectTemplate | undefined>()

  usePageMeta({ breadcrumbs: [{ label: 'Templates' }] })

  const preview = previewId ? getCuratedTemplateById(previewId) : undefined

  const filtered = useMemo(() => {
    const byCat = templatesByCategory(categoryFilter)
    const q = search.trim().toLowerCase()
    if (!q) return byCat
    return byCat.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
    )
  }, [categoryFilter, search])

  const instantiate = async (templateId: string) => {
    if (!workspaceId || !currentUserId || !teamId) return
    const tpl = getCuratedTemplateById(templateId)
    await instantiateTemplate(templateId, {
      teamId,
      ownerId: currentUserId,
      color: tpl?.color ?? 'primary',
      privacy: 'public_to_team',
      defaultView: tpl?.defaultView ?? 'list',
      enabledViews: tpl?.enabledViews ?? PROJECT_VIEWS,
    })
    setPreviewId(null)
  }

  return (
    <div className="space-y-4" data-tour-page="templates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Project templates</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            {TEMPLATE_LIBRARY.length} curated templates across General, Business, Accounting, Law, Finance, Procurement, HR, and Corporate Dev.
          </p>
        </div>
        <Button className="tl-btn-primary border-0" onClick={() => { setEditTemplate(undefined); setCreateOpen(true) }}>
          Create template
        </Button>
      </div>

      <Tabs defaultValue="gallery">
        <TabsList>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="saved">My templates</TabsTrigger>
        </TabsList>

        <TabsContent value="gallery" className="space-y-4 pt-4">
          <TemplateFilters
            category={categoryFilter}
            search={search}
            onCategoryChange={setCategoryFilter}
            onSearchChange={setSearch}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                loading={loadingId === t.id}
                onPreview={() => setPreviewId(t.id)}
                onUse={() => void instantiate(t.id)}
              />
            ))}
          </div>
          {!filtered.length && (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No templates match your filters.</p>
          )}
        </TabsContent>

        <TabsContent value="saved" className="space-y-4 pt-4">
          <SavedTemplatesPanel onEdit={(t) => { setEditTemplate(t); setCreateOpen(true) }} />
        </TabsContent>
      </Tabs>

      <TemplatePreviewDialog
        template={preview ?? null}
        open={Boolean(preview)}
        loading={loadingId === previewId}
        onClose={() => setPreviewId(null)}
        onUse={() => previewId && void instantiate(previewId)}
      />

      {workspaceId && currentUserId && (
        <CreateTemplateModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          workspaceId={workspaceId}
          createdBy={currentUserId}
          initial={editTemplate}
        />
      )}
    </div>
  )
}
