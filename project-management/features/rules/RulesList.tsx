'use client'

/** Rules list grouped by project filter. */
import type { Rule } from '../../types'
import { RuleCard } from './RuleCard'

type Props = {
  rules: Rule[]
  projectName: (id: string) => string
  onEdit: (rule: Rule) => void
  onDuplicate: (rule: Rule) => void
  onDelete: (rule: Rule) => void
  onTest: (rule: Rule) => void
  onHistory: (rule: Rule) => void
}

export function RulesList({
  rules,
  projectName,
  onEdit,
  onDuplicate,
  onDelete,
  onTest,
  onHistory,
}: Props) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground p-8 text-center shadow-sm">
        <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          No rules yet. Create one or start from a template.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {rules.map((rule) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          projectName={projectName(rule.projectId)}
          onEdit={() => onEdit(rule)}
          onDuplicate={() => onDuplicate(rule)}
          onDelete={() => onDelete(rule)}
          onTest={() => onTest(rule)}
          onHistory={() => onHistory(rule)}
        />
      ))}
    </ul>
  )
}
