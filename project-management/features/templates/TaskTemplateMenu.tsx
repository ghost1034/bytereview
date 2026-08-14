'use client'

/**
 * Task-level "Save as template" menu action for list/board task rows.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { saveTaskAsTemplate } from '../../lib/templates/saveTemplate'

type Props = {
  taskId: string
  taskName: string
  workspaceId: string
  createdBy: string
}

export function TaskTemplateMenu({ taskId, taskName, workspaceId, createdBy }: Props) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState(taskName)

  const save = async () => {
    if (!name.trim()) return
    await saveTaskAsTemplate(taskId, workspaceId, name.trim(), createdBy)
    setNaming(false)
  }

  if (naming) {
    return (
      <div className="flex gap-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-input bg-background text-foreground h-8 text-xs" />
        <Button size="sm" className="h-8" onClick={() => void save()}>Save</Button>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs">Template</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setNaming(true)}>Save as task template</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
