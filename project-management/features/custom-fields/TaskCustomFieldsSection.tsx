'use client'

/** Task detail pane custom fields section (self-contained). */
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore } from '../../stores/entities'
import { addFieldToProject } from '../../lib/customFields/customFieldActions'
import { isRequiredFieldEmpty } from '../../lib/customFields/fieldValues'
import type { Task } from '../../types'
import { FieldEditorDialog } from './FieldEditorDialog'
import { FieldValueEditor } from './FieldValueEditor'
import { useTaskProjectFields } from './useProjectFields'

type Props = { task: Task }

export function TaskCustomFieldsSection({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false)
  const taskFields = useTaskProjectFields(task.projectIds)
  const projects = useProjectsStore((s) => s.list())
  const primaryProjectId = task.projectIds[0]
  const primaryProject = projects.find((p) => p.id === primaryProjectId)

  return (
    <div className="text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span style={{ color: 'var(--ink-muted)' }}>Fields</span>
        <button
          type="button"
          className="text-xs font-medium"
          style={{ color: 'var(--primary)' }}
          onClick={() => setFieldEditorOpen(true)}
        >
          + Add field
        </button>
      </div>
      {taskFields.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          No custom fields yet.
        </p>
      ) : (
        <div className="space-y-2">
          {taskFields.map((field) => {
            const missing = isRequiredFieldEmpty(task, field, taskFields)
            return (
              <div key={field.id} className="flex items-start justify-between gap-4">
                <span className="flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                  {field.name}
                  {missing ? (
                    <span title="Required">
                      <AlertTriangle className="h-3 w-3" style={{ color: 'var(--warning)' }} />
                    </span>
                  ) : null}
                </span>
                <FieldValueEditor task={task} field={field} allFields={taskFields} />
              </div>
            )
          })}
        </div>
      )}
      {currentUserId ? (
        <FieldEditorDialog
          open={fieldEditorOpen}
          onOpenChange={setFieldEditorOpen}
          workspaceId={task.workspaceId}
          userId={currentUserId}
          projectId={primaryProjectId}
          defaultGlobal={false}
          onSaved={async (field) => {
            if (primaryProjectId) await addFieldToProject(primaryProjectId, field.id)
          }}
        />
      ) : null}
    </div>
  )
}

/** @deprecated use TaskCustomFieldsSection */
export const TaskBuiltinFieldsSection = TaskCustomFieldsSection
