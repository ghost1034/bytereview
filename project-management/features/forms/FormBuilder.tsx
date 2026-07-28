'use client'

/** FormBuilder — three-pane builder: palette, field list + preview, inspector. */
import { useState } from 'react'
import type { Form, FormField, Project, Section, User } from '../../types'
import {
  createFormField,
  duplicateFormField,
  reorderFields,
} from '../../lib/forms/formFieldFactory'
import { FieldPalette } from './FieldPalette'
import { FormConfigPanel } from './FormConfigPanel'
import { FormFieldEditor } from './FormFieldEditor'
import { FormFieldRow } from './FormFieldRow'
import { FormPreview } from './FormPreview'

type Props = {
  form: Form
  projects: Project[]
  sections: Section[]
  members: User[]
  onChange: (patch: Partial<Form>) => void
}

/** WYSIWYG form builder with palette, canvas preview, and inspector. */
export function FormBuilder({ form, projects, sections, members, onChange }: Props) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const selectedField = form.fields.find((f) => f.id === selectedFieldId)

  const updateFields = (fields: FormField[]) => onChange({ fields })

  const addField = (type: FormField['type']) => {
    const field = createFormField(type)
    updateFields([...form.fields, field])
    setSelectedFieldId(field.id)
  }

  const updateField = (field: FormField) => {
    updateFields(form.fields.map((f) => (f.id === field.id ? field : f)))
  }

  const removeField = (id: string) => {
    updateFields(form.fields.filter((f) => f.id !== id))
    if (selectedFieldId === id) setSelectedFieldId(null)
    if (form.taskTitleFieldId === id) onChange({ taskTitleFieldId: undefined })
  }

  const moveField = (index: number, dir: -1 | 1) => {
    updateFields(reorderFields(form.fields, index, index + dir))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_1fr_240px]">
      <aside className="space-y-4">
        <FieldPalette onAdd={addField} />
      </aside>
      <div className="space-y-4">
        <div className="space-y-2">
          {form.fields.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              Add fields from the palette to build your form.
            </p>
          ) : (
            form.fields.map((field, index) => (
              <FormFieldRow
                key={field.id}
                field={field}
                index={index}
                total={form.fields.length}
                selected={selectedFieldId === field.id}
                isTitleField={form.taskTitleFieldId === field.id}
                onSelect={() => setSelectedFieldId(field.id)}
                onMoveUp={() => moveField(index, -1)}
                onMoveDown={() => moveField(index, 1)}
                onDuplicate={() => updateFields([...form.fields, duplicateFormField(field)])}
                onRemove={() => removeField(field.id)}
              />
            ))
          )}
        </div>
        <FormPreview form={form} />
      </div>
      <aside className="rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        {selectedField ? (
          <FormFieldEditor field={selectedField} onChange={updateField} />
        ) : (
          <FormConfigPanel
            form={form}
            projects={projects}
            sections={sections}
            members={members}
            onChange={onChange}
          />
        )}
      </aside>
    </div>
  )
}
