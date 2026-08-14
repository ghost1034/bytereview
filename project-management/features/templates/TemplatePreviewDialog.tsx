'use client'

/** Read-only preview modal with tabs for template structure. */
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TasklyticDialogContent } from '../shell/TasklyticDialogContent'
import type { CuratedProjectTemplate } from '../../lib/templates/types'
import { countTemplateTasks } from '../../lib/templates/templateLibrary'
import { templatePlaceholderRoles } from '../../lib/templates/templateValidation'
import type { User } from '../../types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  template: CuratedProjectTemplate | null
  open: boolean
  loading: boolean
  onClose: () => void
  onUse: () => void
  users: User[]
  roleAssignments: Record<string, string>
  onRoleAssignmentChange: (role: string, userId: string) => void
}

export function TemplatePreviewDialog({ template, open, loading, onClose, onUse, users, roleAssignments, onRoleAssignmentChange }: Props) {
  if (!template) return null
  const specs = template.taskSpecs ?? []
  const previewTasks = specs.slice(0, 20)
  const hasForms = (template.formTemplates?.length ?? 0) > 0
  const hasDashboards = (template.dashboardTemplates?.length ?? 0) > 0
  const placeholderRoles = templatePlaceholderRoles(template)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <TasklyticDialogContent className="max-w-2xl" aria-describedby={undefined}>
        <Tabs defaultValue="overview">
          <DialogHeader>
            <DialogTitle className="font-sans text-xl">
              {template.iconEmoji} {template.name}
            </DialogTitle>
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{template.description}</p>
          </DialogHeader>

          <TabsList className="mt-2 w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="fields">Custom fields</TabsTrigger>
            <TabsTrigger value="tasks">Starter tasks</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            {placeholderRoles.length ? <TabsTrigger value="roles">Roles</TabsTrigger> : null}
            {hasForms && <TabsTrigger value="forms">Forms</TabsTrigger>}
            {hasDashboards && <TabsTrigger value="dashboards">Dashboards</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="max-h-64 space-y-2 overflow-y-auto text-sm">
            <p><strong>Default view:</strong> {template.defaultView}</p>
            <p><strong>Category:</strong> {template.category}</p>
            {template.suggestedBundles?.length ? (
              <p><strong>Suggested bundles:</strong> {template.suggestedBundles.join(', ')}</p>
            ) : null}
            {template.relatedTemplateIds?.length ? (
              <p><strong>Related templates:</strong> {template.relatedTemplateIds.join(', ')}</p>
            ) : null}
            <p><strong>Tasks:</strong> {countTemplateTasks(template)}</p>
          </TabsContent>

          <TabsContent value="sections" className="max-h-64 overflow-y-auto">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {template.sectionNames.map((name, idx) => {
                const count = specs.filter((s) => s.sectionIndex === idx).length
                return (
                  <li key={name}>
                    {name} <span style={{ color: 'hsl(var(--foreground-muted))' }}>({count} tasks)</span>
                  </li>
                )
              })}
            </ol>
          </TabsContent>

          <TabsContent value="fields" className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  <th className="py-1">Field</th>
                  <th className="py-1">Type</th>
                </tr>
              </thead>
              <tbody>
                {(template.recommendedFields ?? []).map((f) => (
                  <tr key={f.name} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <td className="py-1">{f.name}</td>
                    <td className="py-1">{f.reuseGlobalName ? `global · ${f.type}` : f.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="tasks" className="max-h-64 overflow-y-auto">
            <ul className="space-y-1 text-sm">
              {previewTasks.map((t) => (
                <li key={`${t.name}-${t.sectionIndex}`} style={{ color: 'hsl(var(--foreground-muted))' }}>
                  · {t.name}
                  {t.assigneeRole ? ` — ${t.assigneeRole}` : ''}
                  {t.relativeDueDays != null ? ` (D+${t.relativeDueDays})` : ''}
                </li>
              ))}
              {specs.length > 20 ? (
                <li className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>+ {specs.length - 20} more tasks</li>
              ) : null}
            </ul>
          </TabsContent>

          <TabsContent value="rules" className="max-h-64 overflow-y-auto">
            <ul className="space-y-2 text-sm">
              {(template.ruleTemplates ?? []).map((r) => (
                <li key={r.name} className="rounded border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
                  <strong>{r.name}</strong>
                  <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{r.trigger.type}</p>
                </li>
              ))}
            </ul>
          </TabsContent>

          {placeholderRoles.length ? <TabsContent value="roles" className="max-h-64 space-y-3 overflow-y-auto">
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Resolve placeholder roles before creating the project. Unresolved roles remain visible as task tags.</p>
            {placeholderRoles.map((role) => <label key={role} className="grid grid-cols-[140px_1fr] items-center gap-2 text-sm"><span>{role}</span><Select value={roleAssignments[role] ?? '__unassigned__'} onValueChange={(value) => onRoleAssignmentChange(role, value === '__unassigned__' ? '' : value)}><SelectTrigger aria-label={`Resolve role ${role}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__unassigned__">Leave unassigned</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></label>)}
          </TabsContent> : null}

          {hasForms && (
            <TabsContent value="forms" className="max-h-64 overflow-y-auto text-sm">
              {(template.formTemplates ?? []).map((f) => (
                <div key={f.name} className="mb-3 rounded border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="font-medium">{f.name}</p>
                  <ul className="mt-1 list-disc pl-5" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {f.fields.map((field) => (
                      <li key={field.id}>{field.label}{field.required ? ' *' : ''}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </TabsContent>
          )}

          {hasDashboards && (
            <TabsContent value="dashboards" className="max-h-64 overflow-y-auto">
              <div className="grid gap-2 sm:grid-cols-2">
                {(template.dashboardTemplates ?? []).flatMap((d) =>
                  d.charts.map((c) => (
                    <div key={c.title} className="rounded border p-3 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs capitalize" style={{ color: 'hsl(var(--foreground-muted))' }}>{c.type} chart</p>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={onUse}>Use this template</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}
