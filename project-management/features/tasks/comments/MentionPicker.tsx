'use client'

/**
 * MentionPicker — inline @mention typeahead for workspace users and special tokens.
 */
import { useMemo } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { User } from '../../../types'

export type MentionPick =
  | { kind: 'user'; user: User }
  | { kind: 'token'; token: 'assignee' | 'followers' | 'here'; label: string }

const SPECIAL: Array<{ token: 'assignee' | 'followers' | 'here'; label: string }> = [
  { token: 'assignee', label: '@assignee' },
  { token: 'followers', label: '@followers' },
  { token: 'here', label: '@here' },
]

type Props = {
  users: User[]
  query: string
  onPick: (pick: MentionPick) => void
}

/** Inline mention autocomplete list. */
export function MentionPicker({ users, query, onPick }: Props) {
  const q = query.toLowerCase()

  const options = useMemo(() => {
    const picks: MentionPick[] = SPECIAL.filter((s) => s.label.slice(1).includes(q) || q === '').map(
      (s) => ({ kind: 'token', token: s.token, label: s.label })
    )
    users
      .filter((u) => u.name.toLowerCase().includes(q))
      .slice(0, 8)
      .forEach((user) => picks.push({ kind: 'user', user }))
    return picks
  }, [q, users])

  if (!options.length) return null

  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border shadow-paper-md"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
    >
      <Command shouldFilter={false}>
        <CommandList>
          <CommandEmpty>No matches</CommandEmpty>
          <CommandGroup>
            {options.map((opt) => (
              <CommandItem
                key={opt.kind === 'user' ? opt.user.id : opt.token}
                value={opt.kind === 'user' ? opt.user.id : opt.token}
                onSelect={() => onPick(opt)}
                className="cursor-pointer gap-2"
              >
                {opt.kind === 'user' ? (
                  <>
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: opt.user.avatarColor }}
                    >
                      {opt.user.name.slice(0, 1).toUpperCase()}
                    </span>
                    {opt.user.name}
                  </>
                ) : (
                  <span className="font-medium" style={{ color: 'var(--accent)' }}>
                    {opt.label}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}
