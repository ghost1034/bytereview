'use client'

/** Subtask proposal — checkbox list; only selected items are created on Apply. */
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { CreateSubtasksPayload } from '../../lib/ai/types'
import { createSubtask } from '../../lib/taskActions'

type Props = {
  proposalId: string
  title: string
  payload: CreateSubtasksPayload
  actorId: string | null
  onApplied?: () => void
  onDismiss?: () => void
}

export function AiSubtaskProposalCard({ proposalId, title, payload, actorId, onApplied, onDismiss }: Props) {
  const [selected, setSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(payload.names.map((_, i) => [i, true]))
  )
  const [status, setStatus] = useState<'idle' | 'applying' | 'done' | 'dismissed'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)

  if (status === 'dismissed') return null

  const toggle = (i: number) => setSelected((s) => ({ ...s, [i]: !s[i] }))

  const apply = async () => {
    if (!actorId || status !== 'idle') return
    const names = payload.names.filter((_, i) => selected[i])
    if (!names.length) return
    setStatus('applying')
    let created = 0
    for (const name of names) {
      const res = await createSubtask(payload.parentTaskId, name, actorId)
      if (res.task) created += 1
    }
    setFeedback(`Created ${created} subtask${created === 1 ? '' : 's'}.`)
    setStatus('done')
    onApplied?.()
  }

  return (
    <Card
      key={proposalId}
      className="tl-card shadow-paper-sm transition-shadow hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-2">
        {payload.names.map((name, i) => (
          <label key={name} className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={Boolean(selected[i])} onCheckedChange={() => toggle(i)} />
            <span style={{ color: 'var(--ink-secondary)' }}>{name}</span>
          </label>
        ))}
        {feedback ? <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{feedback}</p> : null}
      </CardContent>
      {status !== 'done' ? (
        <CardFooter className="gap-2 pb-3">
          <Button size="sm" className="tl-btn-primary flex-1 gap-1 border-0" disabled={!actorId || status === 'applying'} onClick={() => void apply()}>
            <Check className="h-3.5 w-3.5" />
            Add selected
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setStatus('dismissed'); onDismiss?.() }}>
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
