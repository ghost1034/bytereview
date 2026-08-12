import type { CuratedProjectTemplate } from './types'
import { countTemplateTasks } from './templateLibrary'

export type TemplateValidationIssue = { templateId: string; field: string; message: string }

export function templatePlaceholderRoles(template: CuratedProjectTemplate): string[] {
  return [...new Set((template.taskSpecs ?? []).flatMap((task) => [task.assigneeRole, ...(task.subtasks ?? []).map((subtask) => subtask.assigneeRole)].filter((role): role is string => Boolean(role))))].sort()
}

export function validateCuratedTemplates(templates: CuratedProjectTemplate[]): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = []
  const ids = new Set<string>()
  for (const template of templates) {
    const add = (field: string, message: string) => issues.push({ templateId: template.id, field, message })
    if (ids.has(template.id)) add('id', 'Template id must be unique')
    ids.add(template.id)
    if (!template.name.trim()) add('name', 'Name is required')
    if (!template.iconEmoji?.trim()) add('iconEmoji', 'Editable icon is required')
    if (!template.sectionNames.length || template.sectionNames.some((section) => !section.trim())) add('sectionNames', 'At least one named section is required')
    if (new Set(template.sectionNames.map((section) => section.toLowerCase())).size !== template.sectionNames.length) add('sectionNames', 'Section names must be unique')
    for (const task of template.taskSpecs ?? []) {
      if (!task.name.trim()) add('taskSpecs', 'Task names are required')
      if (task.sectionIndex < 0 || task.sectionIndex >= template.sectionNames.length) add('taskSpecs', `Task "${task.name}" references an invalid section`)
    }
    if (countTemplateTasks(template) < 1) add('taskTemplates', 'At least one starter task is required')
    if ((template.ruleTemplates?.length ?? 0) < 2) add('ruleTemplates', 'At least two curated rules are required')
    for (const form of template.formTemplates ?? []) {
      const fieldIds = new Set<string>()
      for (const field of form.fields) {
        if (fieldIds.has(field.id)) add('formTemplates', `Form "${form.name}" has duplicate field ids`)
        fieldIds.add(field.id)
      }
      if (form.taskTitleFieldId && !fieldIds.has(form.taskTitleFieldId)) add('formTemplates', `Form "${form.name}" has an invalid task title mapping`)
    }
  }
  return issues
}

export function assertCuratedTemplatesValid(templates: CuratedProjectTemplate[]): void {
  const issues = validateCuratedTemplates(templates)
  if (issues.length) throw new Error(issues.map((issue) => `${issue.templateId}.${issue.field}: ${issue.message}`).join('\n'))
}
