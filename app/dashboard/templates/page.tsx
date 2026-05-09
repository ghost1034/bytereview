'use client'

import { useState } from 'react'
import {
  Edit,
  Eye,
  FileText,
  Globe,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { IconTile } from '@/components/ui/icon-tile'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import {
  useDeleteTemplate,
  usePublicTemplates,
  useTemplates,
} from '@/hooks/useExtraction'
import { useDataTypes } from '@/hooks/useDataTypes'
import { useToast } from '@/hooks/use-toast'
import TemplateModal from '@/components/templates/TemplateModal'
import TemplatePreviewModal from '@/components/templates/TemplatePreviewModal'
import { cn } from '@/lib/utils'

export default function TemplatesPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [activeTemplateType, setActiveTemplateType] = useState<
    'extraction' | 'cpe'
  >('extraction')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<any>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<{
    id: string
    name: string
  } | null>(null)

  const { data: templatesData, isLoading: templatesLoading } = useTemplates()
  const { data: publicTemplatesData, isLoading: publicLoading } =
    usePublicTemplates()
  const { data: dataTypesData, isLoading: dataTypesLoading } = useDataTypes()
  const dataTypes = (dataTypesData as any) || []
  const deleteTemplateMutation = useDeleteTemplate()
  const { toast } = useToast()

  const allUserTemplates = (templatesData as any)?.templates || []
  const allPublicTemplates = (publicTemplatesData as any)?.templates || []
  const loading = templatesLoading || publicLoading

  const getTemplateType = (template: any): 'extraction' | 'cpe' => {
    return template?.template_type === 'cpe' ? 'cpe' : 'extraction'
  }

  const userTemplates = allUserTemplates.filter(
    (t: any) => getTemplateType(t) === activeTemplateType,
  )
  const publicTemplates = allPublicTemplates.filter(
    (t: any) => getTemplateType(t) === activeTemplateType,
  )

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template)
    setModalOpen(true)
  }

  const handleCreateTemplate = () => {
    setEditingTemplate(null)
    setModalOpen(true)
  }

  const handleDeleteTemplate = (id: string, name: string) => {
    setTemplateToDelete({ id, name })
    setDeleteDialogOpen(true)
  }

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return
    try {
      await deleteTemplateMutation.mutateAsync(templateToDelete.id)
      toast({
        title: 'Template deleted',
        description: 'Template deleted successfully.',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete template',
        variant: 'destructive',
      })
    } finally {
      setDeleteDialogOpen(false)
      setTemplateToDelete(null)
    }
  }

  const handlePreviewTemplate = (template: any) => {
    setPreviewTemplate(template)
    setPreviewModalOpen(true)
  }

  const renderTemplateCard = (template: any, isPublic = false) => (
    <div
      key={template.id}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-xs transition-colors',
        'hover:border-border-strong',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={FileText} tone="brand" size="md" />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant="secondary">
            {getTemplateType(template) === 'cpe' ? 'CPE' : 'Extraction'}
          </Badge>
          <Badge
            variant={isPublic ? 'default' : 'outline'}
            className="gap-1"
          >
            {isPublic ? (
              <Globe className="size-3" aria-hidden />
            ) : (
              <Lock className="size-3" aria-hidden />
            )}
            {isPublic ? 'Public' : 'Private'}
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            {template.fields?.length || 0} fields
          </Badge>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {template.name || 'Untitled template'}
        </h3>
        {template.description && (
          <p className="line-clamp-2 text-xs text-foreground-muted">
            {template.description}
          </p>
        )}
      </div>

      <p className="text-[11px] text-foreground-subtle">
        Created {new Date(template.created_at).toLocaleDateString()}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePreviewTemplate(template)}
        >
          <Eye className="mr-1 size-3.5" aria-hidden />
          View
        </Button>
        {!isPublic && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditTemplate(template)}
            >
              <Edit className="mr-1 size-3.5" aria-hidden />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleDeleteTemplate(template.id, template.name)
              }
              disabled={deleteTemplateMutation.isPending}
            >
              <Trash2 className="mr-1 size-3.5" aria-hidden />
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="Templates"
        description="Browse and manage your saved field configurations."
        actions={
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Template type"
              className="inline-flex rounded-md border border-border bg-surface-raised p-1"
            >
              <Button
                type="button"
                role="tab"
                aria-selected={activeTemplateType === 'extraction'}
                variant={
                  activeTemplateType === 'extraction' ? 'default' : 'ghost'
                }
                size="sm"
                onClick={() => setActiveTemplateType('extraction')}
              >
                Extraction
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={activeTemplateType === 'cpe'}
                variant={activeTemplateType === 'cpe' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTemplateType('cpe')}
              >
                CPE
              </Button>
            </div>

            <Button onClick={handleCreateTemplate}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              New template
            </Button>
          </div>
        }
      />

      {publicTemplates.length > 0 && (
        <Section
          variant="card"
          title={
            <span className="inline-flex items-center gap-2">
              <Globe className="size-4 text-foreground-muted" aria-hidden />
              Public templates ({publicTemplates.length})
            </span>
          }
          description="Curated templates the team has shared with everyone."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {publicTemplates.map((template: any) =>
              renderTemplateCard(template, true),
            )}
          </div>
        </Section>
      )}

      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <Lock className="size-4 text-foreground-muted" aria-hidden />
            My templates ({userTemplates.length})
          </span>
        }
        description="Templates only you can see."
      >
        {loading ? (
          <LoadingState
            variant="card-grid"
            rows={3}
            label="Loading templates"
          />
        ) : userTemplates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No personal templates yet"
            description="Create your first template to reuse field configurations across jobs."
            action={
              <Button onClick={handleCreateTemplate}>
                <Plus className="mr-1.5 size-4" aria-hidden />
                Create your first template
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {userTemplates.map((template: any) =>
              renderTemplateCard(template, false),
            )}
          </div>
        )}
      </Section>

      <TemplateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        template={editingTemplate}
        defaultTemplateType={activeTemplateType}
        dataTypes={dataTypes}
        dataTypesLoading={dataTypesLoading}
      />

      <TemplatePreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        template={previewTemplate}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{templateToDelete?.name}
              &rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                'Delete template'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
