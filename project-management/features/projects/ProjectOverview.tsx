'use client'

/**
 * ProjectOverview — overview tab with brief, roles, resources, milestones, status, members.
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import type { Project, ProjectResource } from '../../types'
import { newId } from '../../lib/ids'
import { deleteTask } from '../../lib/taskActions'
import { now, formatDate, formatRelative } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import {
  useActivityStore,
  useProjectsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
} from '../../stores/entities'
import { AttachmentListPanel } from '../attachments/AttachmentListPanel'
import { useProjectAttachmentScope } from '../attachments/useAttachmentScope'
import { MemberAvatarStack } from '../members/MemberAvatarStack'
import { BriefRichEditor } from './BriefRichEditor'
import { ProjectAddMemberButton } from './ProjectAddMemberButton'
import { CreateMilestoneDialog } from './CreateMilestoneDialog'
import { StatusUpdateComposer } from './StatusUpdateComposer'
import { PRIVACY_LABELS, VIEW_LABELS, projectProgress } from './projectUtils'

type Props = { project: Project }

export function ProjectOverview({ project }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const updateProject = useProjectsStore((s) => s.update)
  const tasks = useTasksStore((s) => s.list())
  const team = useTeamsStore((s) => s.getById(project.teamId))
  const owner = useUsersStore((s) => s.getById(project.ownerId))
  const members = useUsersStore((s) =>
    project.memberIds.map((id) => s.getById(id)).filter((u): u is NonNullable<typeof u> => Boolean(u))
  )
  const activity = useActivityStore((s) =>
    s.list().filter((a) => a.projectId === project.id).slice(-10).reverse()
  )
  const projectFiles = useProjectAttachmentScope(project)
  const milestones = tasks.filter(
    (t) => t.projectIds.includes(project.id) && t.resourceSubtype === 'milestone'
  )
  const progress = projectProgress(tasks, project.id)
  const [briefHtml, setBriefHtml] = useState(project.description ?? '')
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)

  const saveBrief = async (html: string) => {
    await updateProject(project.id, { description: html, modifiedAt: now() })
  }

  const setRole = async (userId: string, role: string) => {
    await updateProject(project.id, {
      memberRoles: { ...project.memberRoles, [userId]: role },
      modifiedAt: now(),
    })
  }

  const addResource = async () => {
    const resource: ProjectResource = { id: newId(), title: 'New resource', url: 'https://' }
    await updateProject(project.id, {
      keyResources: [...(project.keyResources ?? []), resource],
      modifiedAt: now(),
    })
  }

  const updateResource = async (id: string, patch: Partial<ProjectResource>) => {
    const next = (project.keyResources ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r))
    await updateProject(project.id, { keyResources: next, modifiedAt: now() })
  }

  const removeResource = async (id: string) => {
    await updateProject(project.id, {
      keyResources: (project.keyResources ?? []).filter((r) => r.id !== id),
      modifiedAt: now(),
    })
  }

  const removeMilestone = async (taskId: string) => {
    await deleteTask(taskId, currentUserId ?? undefined)
  }

  if (!currentUserId) return null

  return (
    <div className="space-y-4">
      <div className="tl-card p-4 shadow-paper-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Completion</span>
          <span className="text-sm tabular-nums" style={{ color: 'var(--ink-muted)' }}>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Project brief</h2>
            <div className="mt-3">
              <BriefRichEditor
                html={briefHtml}
                onChange={(html) => {
                  setBriefHtml(html)
                  void saveBrief(html)
                }}
                placeholder="What's this project about? Outline goals, scope, and deliverables."
              />
            </div>
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Project roles</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--ink-muted)' }}>
                  <th className="pb-2 text-left font-medium">Name</th>
                  <th className="pb-2 text-left font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-2">{m.name}</td>
                    <td className="py-2">
                      <Input
                        className="tl-input h-8"
                        defaultValue={project.memberRoles?.[m.id] ?? 'Member'}
                        onBlur={(e) => void setRole(m.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Documents</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
              Upload files (up to {projectFiles.maxMb} MB each).
            </p>
            <AttachmentListPanel scope={projectFiles} allowLink={false} allowCloudDrive={false} />
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg">Key resources</h2>
              <Button size="sm" variant="outline" onClick={() => void addResource()}>
                <Plus className="mr-1 h-4 w-4" /> Add link
              </Button>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
              Bookmarks to external pages (docs, sites). Enter a title and a URL.
            </p>
            {(project.keyResources ?? []).length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: 'var(--ink-muted)' }}>No resources yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(project.keyResources ?? []).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Input
                      className="tl-input w-36 shrink-0 sm:w-44"
                      defaultValue={r.title}
                      placeholder="Title"
                      onBlur={(e) => void updateResource(r.id, { title: e.target.value })}
                    />
                    <Input
                      className="tl-input min-w-0 flex-1"
                      defaultValue={r.url ?? ''}
                      placeholder="https://…"
                      onBlur={(e) => void updateResource(r.id, { url: e.target.value })}
                    />
                    <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => void removeResource(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg">Milestones</h2>
              <Button size="sm" variant="outline" onClick={() => setMilestoneDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add milestone
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {milestones.length ? milestones.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-muted)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{m.name}</div>
                    {m.notes ? (
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                        {m.notes}
                      </p>
                    ) : null}
                    {m.dueOn ? (
                      <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                        {formatDate(m.dueOn)}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    aria-label={`Delete milestone ${m.name}`}
                    onClick={() => void removeMilestone(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )) : (
                <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No milestones yet.</p>
              )}
            </div>
            <CreateMilestoneDialog
              project={project}
              open={milestoneDialogOpen}
              onOpenChange={setMilestoneDialogOpen}
            />
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Recent activity</h2>
            <ul className="mt-3 space-y-2">
              {activity.length ? activity.map((a) => (
                <li key={a.id} className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
                  <span className="capitalize">{a.type.replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--ink-muted)' }}>{formatRelative(a.createdAt)}</span>
                </li>
              )) : (
                <li className="text-sm" style={{ color: 'var(--ink-muted)' }}>No activity yet.</li>
              )}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Status</h2>
            <div className="mt-3">
              <StatusUpdateComposer project={project} currentUserId={currentUserId} />
            </div>
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Members</h2>
            <MemberAvatarStack users={members} />
            <div className="mt-3">
              <ProjectAddMemberButton project={project} />
            </div>
          </section>

          <section className="tl-card p-5 shadow-paper-sm">
            <h2 className="font-serif text-lg">Project details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-muted)' }}>Team</dt>
                <dd>{team?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-muted)' }}>Owner</dt>
                <dd>{owner?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-muted)' }}>Default view</dt>
                <dd>{VIEW_LABELS[project.defaultView]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-muted)' }}>Privacy</dt>
                <dd>{PRIVACY_LABELS[project.privacy]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-muted)' }}>Start</dt>
                <dd>
                  <Input
                    type="date"
                    className="tl-input h-8 w-auto"
                    defaultValue={project.startOn ?? ''}
                    onBlur={(e) => void updateProject(project.id, { startOn: e.target.value || undefined, modifiedAt: now() })}
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--ink-muted)' }}>Due</dt>
                <dd>
                  <Input
                    type="date"
                    className="tl-input h-8 w-auto"
                    defaultValue={project.dueOn ?? ''}
                    onBlur={(e) => void updateProject(project.id, { dueOn: e.target.value || undefined, modifiedAt: now() })}
                  />
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
