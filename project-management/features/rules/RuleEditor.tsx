'use client'

/** Rule editor dialog — trigger, conditions, actions, name. */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import {
  useCustomFieldsStore,
  useFormsStore,
  useProjectsStore,
  useRulesStore,
  useSectionsStore,
  useUsersStore,
} from '../../stores/entities'
import type { Rule } from '../../types'
import type { RuleTemplate } from './ruleTemplates'
import { ActionList } from './ActionList'
import { ConditionBuilder } from './ConditionBuilder'
import { TriggerPicker } from './TriggerPicker'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  rule?: Rule
  template?: RuleTemplate
  defaultProjectId?: string
}

export function RuleEditor({
  open,
  onOpenChange,
  workspaceId,
  rule,
  template,
  defaultProjectId,
}: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const addRule = useRulesStore((s) => s.add)
  const updateRule = useRulesStore((s) => s.update)
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const sections = useSectionsStore((s) => s.list())
  const forms = useFormsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())

  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [trigger, setTrigger] = useState<Rule['trigger']>({ type: 'task_added_to_project' })
  const [conditions, setConditions] = useState<Rule['conditions']>([])
  const [actions, setActions] = useState<Rule['actions']>([{ type: 'assign_to', userId: '' }])
  const [loading, setLoading] = useState(false)

  const project = projects.find((p) => p.id === projectId)
  const projectSections = useMemo(
    () => sections.filter((s) => s.projectId === projectId),
    [sections, projectId]
  )
  const projectForms = useMemo(
    () => forms.filter((f) => f.projectId === projectId),
    [forms, projectId]
  )
  const projectFields = useMemo(() => {
    if (!project) return []
    return customFields.filter((f) => project.customFieldIds.includes(f.id))
  }, [customFields, project])
  const members = useMemo(() => {
    if (!project) return users
    return users.filter((u) => project.memberIds.includes(u.id))
  }, [project, users])

  useEffect(() => {
    if (!open) return
    if (rule) {
      setName(rule.name)
      setProjectId(rule.projectId)
      setTrigger(rule.trigger)
      setConditions(rule.conditions)
      setActions(rule.actions.length ? rule.actions : [{ type: 'assign_to', userId: members[0]?.id ?? '' }])
    } else if (template) {
      setName(template.name)
      setProjectId(defaultProjectId ?? projects[0]?.id ?? '')
      setTrigger(template.trigger)
      setConditions(template.conditions)
      setActions(template.actions)
    } else {
      setName('')
      setProjectId(defaultProjectId ?? projects[0]?.id ?? '')
      setTrigger({ type: 'task_added_to_project' })
      setConditions([])
      setActions([{ type: 'assign_to', userId: members[0]?.id ?? '' }])
    }
  }, [open, rule, template, defaultProjectId, projects, members])

  const save = async () => {
    if (!currentUserId || !name.trim() || !projectId || actions.length === 0) return
    setLoading(true)
    try {
      if (rule) {
        await updateRule(rule.id, { name: name.trim(), projectId, trigger, conditions, actions })
      } else {
        const row: Rule = {
          id: newId(),
          projectId,
          name: name.trim(),
          enabled: true,
          trigger,
          conditions,
          actions,
          runCount: 0,
          createdBy: currentUserId,
          createdAt: now(),
        }
        await addRule(row)
      }
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">{rule ? 'Edit rule' : 'New rule'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" className="tl-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.iconEmoji ?? '📁'} {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TriggerPicker
            trigger={trigger}
            onChange={setTrigger}
            sections={projectSections}
            forms={projectForms}
            customFields={projectFields}
          />
          <ConditionBuilder
            conditions={conditions}
            onChange={setConditions}
            customFields={projectFields}
            members={members}
            sections={projectSections}
            tags={[]}
          />
          <ActionList
            actions={actions}
            onChange={setActions}
            project={project}
            projects={projects}
            sections={projectSections}
            members={members}
            customFields={projectFields}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading || !name.trim() || !actions.length} onClick={() => void save()}>
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
