'use client'

/** Proposal card — preview diff with Apply / Dismiss (user-confirmed mutations only). */
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { AiProposal, CreateSubtasksPayload } from '../../lib/ai/types'
import { applyProposal } from './proposals'
import { AiSubtaskProposalCard } from './AiSubtaskProposalCard'

type Props = {
  proposal: AiProposal
  actorId: string | null
  onApplied?: () => void
  onDismiss?: () => void
}

export function AiProposalCard({ proposal, actorId, onApplied, onDismiss }: Props) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'done' | 'dismissed'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)

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
    const result = await applyProposal(proposal, actorId)
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
      className="tl-card shadow-paper-sm transition-shadow hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent),0_4px_20px_color-mix(in_srgb,var(--primary)_8%,transparent)]"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm font-medium">{proposal.title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <pre
          className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-xs"
          style={{ background: 'var(--bg-sunken)', color: 'var(--ink-secondary)' }}
        >
          {proposal.preview}
        </pre>
        {feedback ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
            {feedback}
          </p>
        ) : null}
      </CardContent>
      {status !== 'done' ? (
        <CardFooter className="gap-2 pb-3">
          <Button size="sm" className="tl-btn-primary flex-1 gap-1 border-0" disabled={!actorId || status === 'applying'} onClick={() => void apply()}>
            <Check className="h-3.5 w-3.5" />
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              setStatus('dismissed')
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
