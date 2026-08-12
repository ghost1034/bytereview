'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  Copy,
  LayoutTemplate,
  MoreHorizontal,
  Share2,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { projectColorSoft } from '../../lib/projectColors'
import type { ProjectWithTemplateMeta } from '../../lib/templates/types'
import {
  archiveProject,
  duplicateProject,
  renameProject,
  toggleStarProject,
  updateProjectStatus,
} from '../../lib/projectActions'
import type { Project } from '../../types'
import { MemberAvatarStack } from '../members/MemberAvatarStack'
import { SaveProjectAsTemplateModal } from '../templates/SaveProjectAsTemplateModal'
import { SpawnChildProjectOffer } from '../templates/SpawnChildProjectOffer'
import { ApplyBundleDialog } from '../templates/ApplyBundleDialog'
import { ProjectStatusPill } from './ProjectStatusPill'
import { ProjectSettingsDialog } from './ProjectSettingsDialog'

type Props = {
  project: Project
  workspaceId: string
  currentUserId: string
  starred: boolean
  starredIds: string[]
  members: import('../../types').User[]
  settingsOpen: boolean
  onSettingsOpenChange: (open: boolean) => void
  canEdit: boolean
}

/** Project header row with inline rename, status, star, and actions menu. */
export function ProjectHeader({
  project,
  workspaceId,
  currentUserId,
  starred,
  starredIds,
  members,
  settingsOpen,
  onSettingsOpenChange,
  canEdit,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [bundleOpen, setBundleOpen] = useState(false)
  const meta = project as ProjectWithTemplateMeta

  const saveName = async () => {
    setEditing(false)
    if (name.trim() && name.trim() !== project.name) {
      await renameProject(project.id, name, currentUserId)
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/dashboard/project-management/w/${workspaceId}/projects/${project.id}`
    await navigator.clipboard.writeText(url)
  }

  const onDuplicate = async () => {
    const copy = await duplicateProject(project.id, currentUserId)
    router.push(`/dashboard/project-management/w/${workspaceId}/projects/${copy.id}`)
  }

  const onArchive = async () => {
    await archiveProject(project.id, currentUserId)
    setConfirmArchive(false)
    router.push(`/dashboard/project-management/w/${workspaceId}/projects`)
  }

  return (
    <>
      <SpawnChildProjectOffer project={meta} workspaceId={workspaceId} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ background: projectColorSoft(project.color) }}
          >
            {project.iconEmoji ?? '📁'}
          </div>
          <div className="min-w-0">
            {editing ? (
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => e.key === 'Enter' && void saveName()}
                className="tl-input h-9 font-serif text-xl"
                aria-label="Project name"
              />
            ) : (
              <button type="button" disabled={!canEdit} className="text-left font-serif text-2xl hover:opacity-80 disabled:cursor-default" onClick={() => setEditing(true)}>
                {project.name}
              </button>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ProjectStatusPill
                status={project.status}
                editable={canEdit}
                onChange={(s) => void updateProjectStatus(project.id, s, currentUserId)}
              />
              <MemberAvatarStack users={members} size="sm" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={starred ? 'Unstar project' : 'Star project'}
            onClick={() => void toggleStarProject(project.id, currentUserId, starredIds)}
          >
            <Star className="h-4 w-4" fill={starred ? 'var(--warning)' : 'none'} stroke="var(--warning)" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => void share()}>
            <Share2 className="mr-1 h-4 w-4" /> Share
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Project menu">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="tl-popover-surface" align="end">
              {canEdit ? <DropdownMenuItem onClick={() => onSettingsOpenChange(true)}>Edit details</DropdownMenuItem> : null}
              {canEdit ? <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                <LayoutTemplate className="mr-2 h-4 w-4" /> Save as template
              </DropdownMenuItem> : null}
              {canEdit ? <DropdownMenuItem onClick={() => setBundleOpen(true)}>Apply bundle</DropdownMenuItem> : null}
              {canEdit ? <DropdownMenuItem onClick={() => void onDuplicate()}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem> : null}
              {canEdit ? <DropdownMenuSeparator /> : null}
              {canEdit ? <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
                <Archive className="mr-2 h-4 w-4" /> Archive
              </DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ProjectSettingsDialog
        project={project}
        workspaceId={workspaceId}
        currentUserId={currentUserId}
        open={settingsOpen}
        onOpenChange={onSettingsOpenChange}
      />

      <SaveProjectAsTemplateModal
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        projectId={project.id}
        workspaceId={workspaceId}
        createdBy={currentUserId}
        defaultName={project.name}
      />
      <ApplyBundleDialog open={bundleOpen} onOpenChange={setBundleOpen} projectId={project.id} workspaceId={workspaceId} actorId={currentUserId} />

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent className="tl-dialog-surface tl-dialog-mobile">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive project?</AlertDialogTitle>
            <AlertDialogDescription>
              {project.name} will be hidden from the sidebar but all content is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onArchive()}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
