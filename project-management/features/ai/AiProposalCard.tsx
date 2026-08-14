'use client'

/** Proposal card — preview diff with Apply / Dismiss (user-confirmed mutations only). */
import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { AiProposal, CreateSubtasksPayload } from '../../lib/ai/types'
import { applyProposal } from './proposals'
import { AiSubtaskProposalCard } from './AiSubtaskProposalCard'
import { discardServerProposal } from '../../lib/ai/serverState'
import { usesTasklyticBackend } from '../../lib/forms/publicFormApi'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  proposal: AiProposal
  actorId: string | null
  onApplied?: () => void
  onDismiss?: () => void
}

export function AiProposalCard({ proposal, actorId, onApplied, onDismiss }: Props) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'done' | 'dismissed'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftPayload, setDraftPayload] = useState(() => JSON.stringify(proposal.payload, null, 2))

  if (status === 'dismissed') return null

  if (proposal.type === 'create_subtasks') {
    return (
      <AiSubtaskProposalCard
        proposalId={proposal.id}
        title={proposal.title}
        payload={proposal.payload as CreateSubtasksPayload}
        actorId={actorId}
        onApplied={onApplied}
        onDismiss={onDismiss}
      />
    )
  }

  const apply = async () => {
    if (!actorId || status !== 'idle') return
    setStatus('applying')
    let payload = proposal.payload
    if (editing) {
      try {
        payload = JSON.parse(draftPayload) as typeof proposal.payload
      } catch {
        setFeedback('Proposal JSON is invalid.')
        setStatus('idle')
        return
      }
    }
    const result = await applyProposal({ ...proposal, payload }, actorId)
    if (result.ok) {
      setFeedback(result.message)
      setStatus('done')
      onApplied?.()
    } else {
      setFeedback(result.error)
      setStatus('idle')
    }
  }

  return (
    <Card
      className="rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-shadow hover:border-primary hover:shadow-md"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm font-medium">{proposal.title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <pre
          className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-xs"
          style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
        >
          {proposal.preview}
        </pre>
        {editing ? (
          <Textarea aria-label="Editable proposal JSON" className="mt-2 min-h-32 font-mono text-xs" value={draftPayload} onChange={(event) => setDraftPayload(event.target.value)} />
        ) : null}
        {feedback ? (
          <p className="mt-2 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {feedback}
          </p>
        ) : null}
      </CardContent>
      {status !== 'done' ? (
        <CardFooter className="gap-2 pb-3">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing((value) => !value)}>
            <Pencil className="h-3.5 w-3.5" />
            {editing ? 'Preview' : 'Edit'}
          </Button>
          <Button size="sm" className=" flex-1 gap-1 border-0" disabled={!actorId || status === 'applying'} onClick={() => void apply()}>
            <Check className="h-3.5 w-3.5" />
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              setStatus('dismissed')
              if (usesTasklyticBackend()) void discardServerProposal(proposal.id)
              onDismiss?.()
            }}
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
