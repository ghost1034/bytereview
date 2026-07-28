'use client'

/** SubmissionsList — table of form responses linked to created tasks. */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Form, FormSubmission, User } from '../../types'
import { answerSnippet, answerText } from '../../lib/forms/answerFormat'
import { useFormSubmissionsStore, useUsersStore } from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'

type Props = { form: Form }

/** Per-form submissions inbox with detail side panel. */
export function SubmissionsList({ form }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const submissions = useFormSubmissionsStore((s) =>
    s.list().filter((sub) => sub.formId === form.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const users = useUsersStore((s) => s.list())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = submissions.find((s) => s.id === selectedId)

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  if (!submissions.length) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: 'var(--ink-muted)' }}>
        No submissions yet. Share the public link to collect responses.
      </p>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
              <th className="p-3 font-medium">Submitted</th>
              <th className="p-3 font-medium">Submitter</th>
              <th className="p-3 font-medium">Task</th>
              <th className="p-3 font-medium">Answers</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub) => (
              <SubmissionRow
                key={sub.id}
                sub={sub}
                form={form}
                submitter={submitterLabel(sub, userById)}
                selected={selectedId === sub.id}
                onSelect={() => setSelectedId(sub.id)}
                workspaceId={workspaceId ?? ''}
              />
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <SubmissionDetail form={form} sub={selected} submitter={submitterLabel(selected, userById)} workspaceId={workspaceId ?? ''} />
      ) : (
        <p className="text-sm p-4" style={{ color: 'var(--ink-muted)' }}>Select a row to view all answers.</p>
      )}
    </div>
  )
}

function SubmissionRow({
  sub,
  form,
  submitter,
  selected,
  onSelect,
  workspaceId,
}: {
  sub: FormSubmission
  form: Form
  submitter: string
  selected: boolean
  onSelect: () => void
  workspaceId: string
}) {
  return (
    <tr
      className="cursor-pointer border-b"
      style={{
        borderColor: 'var(--border-subtle)',
        background: selected ? 'var(--primary-soft)' : undefined,
      }}
      onClick={onSelect}
    >
      <td className="p-3 whitespace-nowrap">{format(new Date(sub.createdAt), 'MMM d, yyyy h:mm a')}</td>
      <td className="p-3">{submitter}</td>
      <td className="p-3">
        {sub.taskId && workspaceId ? (
          <Link
            href={`/dashboard/project-management/w/${workspaceId}/projects/${form.projectId}?task=${sub.taskId}`}
            className="underline"
            style={{ color: 'var(--primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            View task
          </Link>
        ) : (
          '—'
        )}
      </td>
      <td className="p-3 max-w-xs truncate" style={{ color: 'var(--ink-secondary)' }}>
        {answerSnippet(form, sub.answers)}
      </td>
    </tr>
  )
}

function SubmissionDetail({
  form,
  sub,
  submitter,
  workspaceId,
}: {
  form: Form
  sub: FormSubmission
  submitter: string
  workspaceId: string
}) {
  return (
    <div className="tl-card space-y-3 p-4 shadow-paper-sm">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
        Submission detail
      </p>
      <p className="text-sm"><strong>Submitter:</strong> {submitter}</p>
      <p className="text-sm"><strong>Submitted:</strong> {format(new Date(sub.createdAt), 'PPpp')}</p>
      {sub.taskId && workspaceId ? (
        <Link
          href={`/dashboard/project-management/w/${workspaceId}/projects/${form.projectId}?task=${sub.taskId}`}
          className="text-sm underline"
          style={{ color: 'var(--primary)' }}
        >
          Open created task
        </Link>
      ) : null}
      <dl className="space-y-2 text-sm">
        {form.fields.map((f) => (
          <div key={f.id}>
            <dt className="font-medium">{f.label}</dt>
            <dd style={{ color: 'var(--ink-secondary)' }}>{answerText(f, sub.answers[f.id])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function submitterLabel(sub: FormSubmission, userById: Map<string, User>): string {
  if (!sub.submittedBy) return 'Anonymous'
  const user = userById.get(sub.submittedBy)
  return user ? `${user.name} (${user.email})` : 'Anonymous'
}
