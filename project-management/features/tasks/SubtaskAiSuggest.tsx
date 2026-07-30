'use client'

/** Inline AI suggest subtasks for TaskDetailPane subtask section. */
import { useState } from 'react'
import { MagicButton, buildSubtaskProposal } from '../ai'
import { AiSubtaskProposalCard } from '../ai/AiSubtaskProposalCard'
import { useAuthStore } from '../../stores/auth'
import type { CreateSubtasksPayload } from '../../lib/ai/types'

type Props = { taskId: string }

/** Magic button + proposal card for subtask suggestions. */
export function SubtaskAiSuggest({ taskId }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [proposal, setProposal] = useState<{ id: string; title: string; payload: CreateSubtasksPayload } | null>(null)
  const [loading, setLoading] = useState(false)

  const suggest = async () => {
    if (loading) return
    setLoading(true)
    try {
      const p = await buildSubtaskProposal(taskId)
      if (p && p.type === 'create_subtasks') {
        setProposal({
          id: p.id,
          title: p.title,
          payload: p.payload as CreateSubtasksPayload,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <MagicButton label={loading ? '…' : 'Suggest subtasks'} onClick={() => void suggest()} disabled={loading} />
      {proposal ? (
        <AiSubtaskProposalCard
          proposalId={proposal.id}
          title={proposal.title}
          payload={proposal.payload}
          actorId={currentUserId}
          onApplied={() => setProposal(null)}
          onDismiss={() => setProposal(null)}
        />
      ) : null}
    </div>
  )
}
