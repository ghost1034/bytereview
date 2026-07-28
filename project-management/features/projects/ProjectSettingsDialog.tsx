'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  archiveProject,
  deleteProject,
  addProjectSection,
  deleteProjectSection,
  renameProjectSection,
  reorderProjectSections,
} from '../../lib/projectActions'
import { now } from '../../lib/time'
import type { Project, ProjectView } from '../../types'
import { useProjectsStore, useSectionsStore, useTeamsStore } from '../../stores/entities'
import { EmojiPicker } from '../workspaces/EmojiPicker'
import { TasklyticDialogContent } from '../shell/TasklyticDialogContent'
import { ProjectColorPicker } from './ProjectColorPicker'
import { ProjectViewCards } from './ProjectViewCards'
import { PRIVACY_LABELS, PROJECT_VIEWS } from './projectUtils'

type Props = {
  project: Project
  workspaceId: string
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Project settings dialog with general, views, sections, and advanced tabs. */
export function ProjectSettingsDialog({ project, workspaceId, currentUserId, open, onOpenChange }: Props) {
  const updateProject = useProjectsStore((s) => s.update)
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const sections = useSectionsStore((s) =>
    project.sectionIds.map((id) => s.getById(id)).filter(Boolean)
  )
  const [name, setName] = useState(project.name)
  const [iconEmoji, setIconEmoji] = useState(project.iconEmoji ?? '📁')
  const [color, setColor] = useState(project.color)
  const [privacy, setPrivacy] = useState(project.privacy)
  const [teamId, setTeamId] = useState(project.teamId)
  const [defaultView, setDefaultView] = useState(project.defaultView)
  const [enabledViews, setEnabledViews] = useState<ProjectView[]>(project.enabledViews ?? [...PROJECT_VIEWS])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newSection, setNewSection] = useState('')

  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0)),
    [sections]
  )

  const saveGeneral = async () => {
    await updateProject(project.id, {
      name: name.trim() || project.name,
      iconEmoji,
      color,
      privacy,
      teamId,
      defaultView,
      enabledViews,
      modifiedAt: now(),
    })
    onOpenChange(false)
  }

  const moveSection = async (index: number, dir: -1 | 1) => {
    const ids = orderedSections.map((s) => s!.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await reorderProjectSections(project.id, ids)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <TasklyticDialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Project settings</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general">
            <TabsList className="mb-4 flex flex-wrap">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="views">Views</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="space-y-3">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input className="tl-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Icon</Label>
                <EmojiPicker value={iconEmoji} onChange={setIconEmoji} size="sm" />
              </div>
              <div className="grid gap-2">
                <Label>Color</Label>
                <ProjectColorPicker value={color} onChange={setColor} />
              </div>
              <div className="grid gap-2">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="tl-popover-surface z-[100]">
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Privacy</Label>
                <Select value={privacy} onValueChange={(v) => setPrivacy(v as Project['privacy'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="tl-popover-surface z-[100]">
                    {(Object.keys(PRIVACY_LABELS) as Project['privacy'][]).map((key) => (
                      <SelectItem key={key} value={key}>{PRIVACY_LABELS[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            <TabsContent value="views">
              <ProjectViewCards
                defaultView={defaultView}
                enabledViews={enabledViews}
                onDefaultChange={setDefaultView}
                onEnabledChange={setEnabledViews}
              />
            </TabsContent>
            <TabsContent value="sections" className="space-y-3">
              <ul className="space-y-2">
                {orderedSections.map((section, index) => section && (
                  <li key={section.id} className="flex items-center gap-2">
                    <Input
                      className="tl-input flex-1"
                      defaultValue={section.name}
                      onBlur={(e) => void renameProjectSection(section.id, e.target.value)}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => void moveSection(index, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void moveSection(index, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void deleteProjectSection(section.id)}>
                      <Trash2 className="h-4 w-4" style={{ color: 'var(--danger)' }} />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input className="tl-input" placeholder="New section" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => { void addProjectSection(project.id, newSection).then(() => setNewSection('')) }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="advanced" className="space-y-3">
              <Button variant="outline" className="w-full justify-start" onClick={() => void archiveProject(project.id, currentUserId).then(() => onOpenChange(false))}>
                Archive project
              </Button>
              <Button variant="destructive" className="w-full justify-start" onClick={() => setConfirmDelete(true)}>
                Delete project permanently
              </Button>
              <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                Custom fields and notifications are configured in dedicated settings (steps 14 & 17).
              </p>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="tl-btn-primary border-0" onClick={() => void saveGeneral()}>Save changes</Button>
          </DialogFooter>
        </TasklyticDialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="tl-dialog-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {project.name} and all tasks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteProject(project.id, currentUserId).then(() => onOpenChange(false))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
