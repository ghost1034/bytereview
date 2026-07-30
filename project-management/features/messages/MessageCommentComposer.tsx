'use client'

import { useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { parseMentions } from '../../lib/comments'
import { addProjectMessageComment } from '../../lib/projectMessages'
import type { User } from '../../types'

type Props = {
  messageId: string
  authorId: string
  workspaceUsers: User[]
  onPosted?: () => void
}

/** Lightweight comment composer for project message threads. */
export function MessageCommentComposer({ messageId, authorId, workspaceUsers, onPosted }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const userMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>()
    workspaceUsers.forEach((u) => map.set(u.name.toLowerCase(), { id: u.id, name: u.name, color: u.avatarColor }))
    return map
  }, [workspaceUsers])

  const submit = async () => {
    const text = ref.current?.innerText ?? ''
    if (!text.trim()) return
    const { bodyHtml, mentionedUserIds } = parseMentions(text, userMap)
    await addProjectMessageComment(messageId, authorId, bodyHtml, mentionedUserIds)
    if (ref.current) ref.current.innerHTML = ''
    onPosted?.()
  }

  return (
    <div className="mt-3 space-y-2">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="min-h-14 rounded-lg border px-3 py-2 text-sm outline-none tl-input"
        data-placeholder="Add a comment… (@ to mention)"
      />
      <Button size="sm" className="tl-btn-primary border-0" onClick={() => void submit()}>
        Post comment
      </Button>
    </div>
  )
}
