'use client'

/**
 * TaskBuiltinFields — project custom fields inline + add-field action.
 */
import { useState } from 'react'
import { FieldValueEditor } from '../custom-fields/FieldValueEditor'
import { FieldEditorDialog } from '../custom-fields/FieldEditorDialog'
import { useTaskProjectFields } from '../custom-fields/useProjectFields'
import { addFieldToProject } from '../../lib/customFields/customFieldActions'
import { useAuthStore } from '../../stores/auth'
import type { Task } from '../../types'

type Props = { task: Task }

export function TaskBuiltinFields({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false)
  const taskFields = useTaskProjectFields(task.projectIds)

  return (
    <div className="text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span style={{ color: 'hsl(var(--foreground-muted))' }}>Fields</span>
        <button
          type="button"
          className="text-xs font-medium"
          style={{ color: 'hsl(var(--primary))' }}
          onClick={() => setFieldEditorOpen(true)}
        >
          + Add fields
        </button>
      </div>
      {taskFields.length === 0 ? (
        <p className="text-xs" style={{ color: 'hsl(var(--foreground-subtle))' }}>
          No custom fields yet.
        </p>
      ) : (
        <div className="space-y-2">
          {taskFields.map((field) => (
            <div key={field.id} className="flex items-center justify-between gap-4">
              <span style={{ color: 'hsl(var(--foreground-muted))' }}>{field.name}</span>
              <FieldValueEditor task={task} field={field} />
            </div>
          ))}
        </div>
      )}
      {currentUserId ? (
        <FieldEditorDialog
          open={fieldEditorOpen}
          onOpenChange={setFieldEditorOpen}
          workspaceId={task.workspaceId}
          userId={currentUserId}
          defaultGlobal={false}
          onSaved={async (field) => {
            const projectId = task.projectIds[0]
            if (projectId) await addFieldToProject(projectId, field.id)
          }}
        />
      ) : null}
    </div>
  )
}
