'use client'

/** FormEditor — tabs for builder and submissions with publish controls. */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffect, useMemo, useState } from 'react'
import type { Form } from '../../types'
import { generatePublicSlug } from '../../lib/forms/formFieldFactory'
import { useFormsStore, useProjectsStore, useSectionsStore, useUsersStore } from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { FormBuilder } from './FormBuilder'
import { FormListItemActions } from './FormListItem'
import { SubmissionsList } from './SubmissionsList'

type Props = { form: Form }

/** Full editor shell for a selected form. */
export function FormEditor({ form: initial }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const updateForm = useFormsStore((s) => s.update)
  const live = useFormsStore((s) => s.getById(initial.id)) ?? initial
  const [draft, setDraft] = useState(live)

  useEffect(() => {
    setDraft(useFormsStore.getState().getById(initial.id) ?? initial)
  }, [initial.id])

  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const sections = useSectionsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const workspace = useMemo(() => {
    const project = projects.find((p) => p.id === draft.projectId)
    const memberIds = new Set(project?.memberIds ?? [])
    return users.filter((u) => memberIds.has(u.id))
  }, [draft.projectId, projects, users])

  const persist = (patch: Partial<Form>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    void updateForm(draft.id, patch)
  }

  const publish = async () => {
    const patch: Partial<Form> = { isPublic: true }
    if (!draft.publicSlug) patch.publicSlug = generatePublicSlug()
    setDraft((d) => ({ ...d, ...patch }))
    await updateForm(draft.id, patch)
  }

  const unpublish = async () => {
    setDraft((d) => ({ ...d, isPublic: false }))
    await updateForm(draft.id, { isPublic: false })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">{draft.name}</h2>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            {draft.fields.length} fields · {draft.isPublic ? 'Published' : 'Draft'}
            {draft.publicSlug ? ` · slug ${draft.publicSlug}` : ''}
          </p>
        </div>
        <FormListItemActions form={draft} onPublish={() => void publish()} onUnpublish={() => void unpublish()} />
      </div>
      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>
        <TabsContent value="builder" className="mt-4">
          <FormBuilder
            form={draft}
            projects={projects}
            sections={sections}
            members={workspace}
            onChange={persist}
          />
        </TabsContent>
        <TabsContent value="submissions" className="mt-4">
          <SubmissionsList form={draft} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
