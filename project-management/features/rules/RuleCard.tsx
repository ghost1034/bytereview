'use client'

/** Rule card — summary pills, toggle, menu, inline name edit. */
import { useState } from 'react'
import { Copy, History, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { formatRelative } from '../../lib/time'
import { useRulesStore } from '../../stores/entities'
import type { Rule } from '../../types'
import { ruleSummaryParts } from './ruleLabels'

type Props = {
  rule: Rule
  projectName: string
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTest: () => void
  onHistory: () => void
}

export function RuleCard({
  rule,
  projectName,
  onEdit,
  onDuplicate,
  onDelete,
  onTest,
  onHistory,
}: Props) {
  const updateRule = useRulesStore((s) => s.update)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(rule.name)
  const parts = ruleSummaryParts(rule)

  const saveName = async () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== rule.name) {
      await updateRule(rule.id, { name: trimmed })
    }
    setEditingName(false)
  }

  return (
    <li className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {editingName ? (
            <Input
              className="rounded-md border border-input bg-background text-foreground h-8 max-w-md font-medium"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName()
                if (e.key === 'Escape') setEditingName(false)
              }}
            />
          ) : (
            <button
              type="button"
              className="group flex items-center gap-1 text-left font-medium"
              onClick={() => {
                setNameDraft(rule.name)
                setEditingName(true)
              }}
            >
              {rule.name}
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
            </button>
          )}
          <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{projectName}</p>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span style={{ color: 'hsl(var(--foreground-muted))' }}>When</span>
            <Badge variant="secondary" className="font-normal">{parts.trigger}</Badge>
            {parts.conditions ? (
              <>
                <span style={{ color: 'hsl(var(--foreground-muted))' }}>if</span>
                <Badge variant="outline" className="font-normal">{parts.conditions}</Badge>
              </>
            ) : null}
            <span style={{ color: 'hsl(var(--foreground-muted))' }}>then</span>
            {parts.actions.map((a, i) => (
              <Badge key={i} className="font-normal" style={{ background: 'hsl(var(--success-soft))', color: 'hsl(var(--success))' }}>
                {a}
              </Badge>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'hsl(var(--foreground-subtle))' }}>
            {rule.runCount} run{rule.runCount === 1 ? '' : 's'}
            {rule.lastRunAt ? ` · Last run ${formatRelative(rule.lastRunAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={onTest}>
            <Play className="h-3.5 w-3.5" /> Test
          </Button>
          <Switch
            checked={rule.enabled}
            onCheckedChange={(v) => void updateRule(rule.id, { enabled: v })}
            aria-label={`Toggle ${rule.name}`}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onHistory}>
                <History className="mr-2 h-4 w-4" /> View history
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}
