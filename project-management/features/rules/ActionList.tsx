'use client'

/** Ordered action list with add/remove/reorder. */
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { CustomField, Project, RuleAction, Section, User } from '../../types'
import { ActionEditor } from './ActionEditor'

type Props = {
  actions: RuleAction[]
  onChange: (actions: RuleAction[]) => void
  project: Project | undefined
  projects: Project[]
  sections: Section[]
  members: User[]
  customFields: CustomField[]
}

export function ActionList({
  actions,
  onChange,
  project,
  projects,
  sections,
  members,
  customFields,
}: Props) {
  const addAction = () => {
    onChange([...actions, { type: 'assign_to', userId: members[0]?.id ?? '' }])
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...actions]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Label>Then</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addAction}>
          <Plus className="mr-1 h-4 w-4" /> Add action
        </Button>
      </div>
      {actions.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Add at least one action.</p>
      ) : (
        actions.map((action, index) => (
          <div key={index} className="flex gap-2">
            <div className="flex flex-col gap-1 pt-2">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => move(index, -1)}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === actions.length - 1} onClick={() => move(index, 1)}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <ActionEditor
                action={action}
                onChange={(next) => onChange(actions.map((a, i) => (i === index ? next : a)))}
                project={project}
                projects={projects}
                sections={sections}
                members={members}
                customFields={customFields}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onChange(actions.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}
    </div>
  )
}
