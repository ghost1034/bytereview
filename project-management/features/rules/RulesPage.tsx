'use client'

/** Rules page — list, create, templates, test, and daily scheduler. */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { useRulesStore, useProjectsStore } from '../../stores/entities'
import type { Rule } from '../../types'
import { RuleEditor } from './RuleEditor'
import { RuleHistoryModal } from './RuleHistoryModal'
import { RuleLibrary } from './RuleLibrary'
import { RulesList } from './RulesList'
import type { RuleTemplate } from './ruleTemplates'
import { TestRuleDialog } from './TestRuleDialog'

export function RulesPage() {
  const { workspaceId } = useWorkspaceContext()
  const addRule = useRulesStore((s) => s.add)
  const removeRule = useRulesStore((s) => s.remove)
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])
  const rules = useRulesStore((s) => s.list().filter((r) => projectIds.has(r.projectId)))

  const [filterProjectId, setFilterProjectId] = useState<string>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editRule, setEditRule] = useState<Rule | undefined>()
  const [template, setTemplate] = useState<RuleTemplate | undefined>()
  const [testRule, setTestRule] = useState<Rule | null>(null)
  const [historyRule, setHistoryRule] = useState<Rule | null>(null)
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null)

  usePageMeta({ breadcrumbs: [{ label: 'Rules' }] })

  const filteredRules = useMemo(() => {
    if (filterProjectId === 'all') return rules
    return rules.filter((r) => r.projectId === filterProjectId)
  }, [rules, filterProjectId])

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Project'

  const openNew = () => {
    setEditRule(undefined)
    setTemplate(undefined)
    setEditorOpen(true)
  }

  const openTemplate = (t: RuleTemplate) => {
    setEditRule(undefined)
    setTemplate(t)
    setEditorOpen(true)
  }

  const duplicateRule = async (rule: Rule) => {
    const copy: Rule = {
      ...rule,
      id: newId(),
      name: `${rule.name} (copy)`,
      runCount: 0,
      lastRunAt: undefined,
      createdAt: now(),
    }
    await addRule(copy)
  }

  if (!workspaceId) return null

  return (
    <div className="space-y-4" data-tour-page="rules">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Rules</h1>
        <div className="flex items-center gap-2">
          <RuleLibrary onSelect={openTemplate} />
          <Button className="tl-btn-primary gap-2 border-0" onClick={openNew}>
            <Plus className="h-4 w-4" /> New rule
          </Button>
        </div>
      </div>

      {projects.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-sm" style={{ color: 'var(--ink-muted)' }}>Project</Label>
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <RulesList
        rules={filteredRules}
        projectName={projectName}
        onEdit={(r) => {
          setEditRule(r)
          setTemplate(undefined)
          setEditorOpen(true)
        }}
        onDuplicate={(r) => void duplicateRule(r)}
        onDelete={setDeleteRule}
        onTest={setTestRule}
        onHistory={setHistoryRule}
      />

      <RuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        workspaceId={workspaceId}
        rule={editRule}
        template={template}
        defaultProjectId={filterProjectId !== 'all' ? filterProjectId : undefined}
      />

      <TestRuleDialog rule={testRule} open={Boolean(testRule)} onOpenChange={(o) => !o && setTestRule(null)} />
      <RuleHistoryModal rule={historyRule} open={Boolean(historyRule)} onOpenChange={(o) => !o && setHistoryRule(null)} />

      <Dialog open={Boolean(deleteRule)} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <DialogContent className="tl-dialog-surface max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete rule?</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            &ldquo;{deleteRule?.name}&rdquo; will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteRule(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteRule) void removeRule(deleteRule.id)
                setDeleteRule(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
