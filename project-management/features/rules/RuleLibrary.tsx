'use client'

/** Template dropdown — instantiate curated rules into the editor. */
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RuleTemplate } from './ruleTemplates'
import { RULE_TEMPLATES } from './ruleTemplates'

type Props = {
  onSelect: (template: RuleTemplate) => void
}

export function RuleLibrary({ onSelect }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          From template
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {RULE_TEMPLATES.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => onSelect(t)} className="flex flex-col items-start gap-0.5">
            <span className="font-medium">{t.name}</span>
            <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{t.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
