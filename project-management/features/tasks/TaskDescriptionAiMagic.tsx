'use client'

/** Inline AI magic for task description — suggest subtasks hook reserved for SubtaskList. */
import { useState } from 'react'
import { MagicButton } from '../ai/MagicButton'
import { getAiAdapter } from '../../lib/ai'
import { buildAiContext } from '../ai/contextBuilder'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import { updateNotes } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import type { UpdateDescriptionPayload } from '../../lib/ai/types'
import type { Task } from '../../types'

type Props = { task: Task; onUpdated?: () => void }

/** Low-risk AI rewrite for task description notes. */
export function TaskDescriptionAiMagic({ task, onUpdated }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [loading, setLoading] = useState(false)

  const rewrite = async () => {
    if (!currentUserId || loading) return
    setLoading(true)
    try {
      const context = buildAiContext({ type: 'task', taskId: task.id })
      const result = await getAiAdapter().generate({
        prompt: 'Rewrite this task description to be clearer and more actionable. Return plain HTML paragraphs only.',
        context,
      })
      const proposal = result.proposals.find((p) => p.type === 'update_description')
      if (proposal?.type === 'update_description') {
        const payload = proposal.payload as UpdateDescriptionPayload
        const html = sanitizeHtml(payload.nextNotes)
        await updateNotes(task.id, html, currentUserId)
        onUpdated?.()
      }
    } finally {
      setLoading(false)
    }
  }

  return <MagicButton label={loading ? '…' : 'Polish'} onClick={() => void rewrite()} disabled={loading} />
}
