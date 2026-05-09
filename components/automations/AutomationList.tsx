'use client'

import { useState } from 'react'
import {
  Calendar,
  Clock,
  Eye,
  Pause,
  Play,
  Plus,
  Settings,
  Trash2,
  Zap,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Section } from '@/components/ui/section'
import {
  useAutomations,
  useDeleteAutomation,
  useToggleAutomation,
} from '@/hooks/useAutomations'
import { AutomationModal } from './AutomationModal'
import { AutomationRunsModal } from './AutomationRunsModal'

export function AutomationList() {
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [runsModalOpen, setRunsModalOpen] = useState(false)
  const [selectedAutomationId, setSelectedAutomationId] = useState<
    string | null
  >(null)

  const { data: automations, isLoading, error } = useAutomations()
  const toggleAutomation = useToggleAutomation()
  const deleteAutomation = useDeleteAutomation()

  const handleEdit = (id: string) => {
    setSelectedAutomationId(id)
    setEditModalOpen(true)
  }
  const handleViewRuns = (id: string) => {
    setSelectedAutomationId(id)
    setRunsModalOpen(true)
  }
  const handleToggle = (id: string) => toggleAutomation.mutate(id)
  const handleDelete = (id: string) => deleteAutomation.mutate(id)

  return (
    <Section
      variant="card"
      title="Your automations"
      description="Workflows that fire when matching documents arrive."
      action={
        <Button
          onClick={() => setCreateModalOpen(true)}
          size="sm"
          disabled={isLoading}
        >
          <Plus className="mr-1.5 size-4" aria-hidden />
          New automation
        </Button>
      }
    >
      {isLoading ? (
        <LoadingState variant="list" rows={3} label="Loading automations" />
      ) : error ? (
        <ErrorState
          title="Failed to load automations"
          description="There was an issue loading your automations. Please try again."
        />
      ) : !automations || automations.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automations yet"
          description="Create automated workflows that trigger when emails arrive at document@cpaautomation.ai."
          action={
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              Create your first automation
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="rounded-lg border border-border bg-surface-raised p-4 shadow-xs transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {automation.name}
                    </h3>
                    <Badge
                      variant={
                        automation.is_enabled ? 'default' : 'secondary'
                      }
                    >
                      {automation.is_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-foreground-muted">
                    Gmail trigger:{' '}
                    <span className="font-mono">
                      {automation.trigger_config.query}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="View runs"
                    className="size-8"
                    onClick={() => handleViewRuns(automation.id)}
                  >
                    <Eye className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit automation"
                    className="size-8"
                    onClick={() => handleEdit(automation.id)}
                  >
                    <Settings className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      automation.is_enabled
                        ? 'Disable automation'
                        : 'Enable automation'
                    }
                    className="size-8"
                    onClick={() => handleToggle(automation.id)}
                    disabled={toggleAutomation.isPending}
                  >
                    {automation.is_enabled ? (
                      <Pause className="size-4" aria-hidden />
                    ) : (
                      <Play className="size-4" aria-hidden />
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete automation"
                        className="size-8 text-destructive/80 hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete automation</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &ldquo;
                          {automation.name}&rdquo;? This action cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(automation.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" aria-hidden />
                  Created{' '}
                  {formatDistanceToNow(new Date(automation.created_at), {
                    addSuffix: true,
                  })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden />
                  Updated{' '}
                  {formatDistanceToNow(new Date(automation.updated_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>

              {automation.dest_type && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    Export to{' '}
                    {automation.dest_type === 'gdrive'
                      ? 'Google Drive'
                      : 'Gmail'}
                  </Badge>
                  {automation.export_config?.folder_id && (
                    <span className="text-xs text-foreground-muted">
                      Folder: {automation.export_config.folder_id}
                    </span>
                  )}
                  {automation.export_config?.to_email && (
                    <span className="text-xs text-foreground-muted">
                      Email: {automation.export_config.to_email}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AutomationModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />

      {selectedAutomationId && (
        <>
          <AutomationModal
            automationId={selectedAutomationId}
            open={editModalOpen}
            onOpenChange={setEditModalOpen}
          />
          <AutomationRunsModal
            automationId={selectedAutomationId}
            open={runsModalOpen}
            onOpenChange={setRunsModalOpen}
          />
        </>
      )}
    </Section>
  )
}
