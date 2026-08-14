'use client'

/** Test rule dialog — dry-run against a chosen task. */
import { useState } from 'react'
import { Play } from 'lucide-react'
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
import { describeRule, testRunRule } from '../../lib/rulesEngine'
import { useTasksStore } from '../../stores/entities'
import type { Rule } from '../../types'
import { actionLabel } from './ruleLabels'

type Props = {
  rule: Rule | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TestRuleDialog({ rule, open, onOpenChange }: Props) {
  const tasks = useTasksStore((s) =>
    rule ? s.list().filter((t) => t.projectIds.includes(rule.projectId)) : []
  )
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '')
  const [result, setResult] = useState<string | null>(null)

  if (!rule) return null

  const run = () => {
    const task = tasks.find((t) => t.id === taskId) ?? tasks[0]
    if (!task) {
      setResult('No task selected')
      return
    }
    const out = testRunRule(rule, task)
    const detail = out.actionsWouldRun.map(actionLabel).join(', ')
    setResult(out.matched ? `${out.summary}${detail ? `: ${detail}` : ''}` : out.summary)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg">Test rule — {rule.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{describeRule(rule)}</p>
          <div className="grid gap-2">
            <Label>Task</Label>
            <Select value={taskId || tasks[0]?.id} onValueChange={setTaskId}>
              <SelectTrigger><SelectValue placeholder="Select task" /></SelectTrigger>
              <SelectContent className="z-[100]">
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Dry run only — no mutations applied.
          </p>
          {result ? (
            <p className="rounded-md p-2 text-sm" style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}>
              {result}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="tl-btn-primary gap-2 border-0" disabled={!taskId && !tasks[0]} onClick={run}>
            <Play className="h-4 w-4" /> Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
