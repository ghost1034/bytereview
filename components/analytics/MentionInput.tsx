'use client'

import * as React from 'react'

import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useAnalyticsFirm } from '@/hooks/useAnalyticsTeam'
import type { AnalyticsFirmMember } from '@/lib/analytics/types'

interface MentionInputProps {
  value: string
  onChange: (body: string, mentionedUserIds: string[]) => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  className?: string
  /** Hook a submit button outside the component to this via ref instead, if needed. */
  onSubmit?: () => void
}

interface MentionState {
  open: boolean
  query: string
  /** Index of the `@` character in `value` that triggered the popover. */
  triggerIndex: number
}

const CLOSED: MentionState = { open: false, query: '', triggerIndex: -1 }

function getMemberLabel(m: AnalyticsFirmMember): string {
  return m.display_name?.trim() || m.email
}

/** Resolve which mentioned UIDs survive after a body edit — drop entries whose
 *  `@DisplayName` token is no longer present so the array stays in sync. */
function reconcileMentions(
  body: string,
  current: Array<{ userId: string; label: string }>
): Array<{ userId: string; label: string }> {
  return current.filter((m) => body.includes(`@${m.label}`))
}

export function MentionInput({
  value,
  onChange,
  placeholder = 'Write a comment… use @ to mention',
  disabled,
  rows = 3,
  className,
  onSubmit,
}: MentionInputProps) {
  const { data: firm } = useAnalyticsFirm()
  const members = firm?.members ?? []

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = React.useState<MentionState>(CLOSED)
  // Track (userId, label) pairs so we can rebuild mentioned_user_ids from body text.
  const [tracked, setTracked] = React.useState<Array<{ userId: string; label: string }>>([])

  const updateValue = React.useCallback(
    (next: string, nextTracked: Array<{ userId: string; label: string }>) => {
      const reconciled = reconcileMentions(next, nextTracked)
      setTracked(reconciled)
      onChange(next, reconciled.map((m) => m.userId))
    },
    [onChange]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    const caret = e.target.selectionStart ?? next.length

    // Look back from the caret for an unbroken @token (no whitespace).
    let triggerIndex = -1
    for (let i = caret - 1; i >= 0; i--) {
      const ch = next[i]
      if (ch === '@') {
        triggerIndex = i
        break
      }
      if (/\s/.test(ch)) break
    }

    if (triggerIndex >= 0) {
      const query = next.slice(triggerIndex + 1, caret)
      setMention({ open: true, query, triggerIndex })
    } else {
      setMention(CLOSED)
    }

    updateValue(next, tracked)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && mention.open) {
      setMention(CLOSED)
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  const filteredMembers = React.useMemo(() => {
    if (!mention.open) return []
    const q = mention.query.trim().toLowerCase()
    if (!q) return members.slice(0, 8)
    return members
      .filter((m) => {
        const label = getMemberLabel(m).toLowerCase()
        return label.includes(q) || m.email.toLowerCase().includes(q)
      })
      .slice(0, 8)
  }, [mention, members])

  const insertMention = (member: AnalyticsFirmMember) => {
    if (mention.triggerIndex < 0) return
    const label = getMemberLabel(member)
    const before = value.slice(0, mention.triggerIndex)
    const afterCaret = value.slice(
      (textareaRef.current?.selectionStart ?? mention.triggerIndex + mention.query.length + 1)
    )
    const next = `${before}@${label} ${afterCaret}`

    const nextTracked = [...tracked, { userId: member.user_id, label }]
    updateValue(next, nextTracked)
    setMention(CLOSED)

    // Restore focus and move caret past the inserted mention.
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      const caret = before.length + label.length + 2 // '@' + label + space
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  return (
    <Popover open={mention.open && filteredMembers.length > 0} onOpenChange={(o) => !o && setMention(CLOSED)}>
      <PopoverTrigger asChild>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={cn('resize-none', className)}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-64 overflow-y-auto">
          {filteredMembers.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => insertMention(m)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Avatar className="h-6 w-6">
                {m.photo_url ? <AvatarImage src={m.photo_url} alt={getMemberLabel(m)} /> : null}
                <AvatarFallback className="text-xs">
                  {getMemberLabel(m).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">
                <span className="font-medium">{getMemberLabel(m)}</span>
                {m.display_name ? (
                  <span className="ml-1 text-xs text-muted-foreground">{m.email}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
