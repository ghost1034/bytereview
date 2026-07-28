'use client'

/** Built-in emoji palette with search for workspace/team icons. */
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'

export const EMOJI_PALETTE = [
  '🏢', '🚀', '💼', '🎯', '📊', '🛠️', '🎨', '🌱', '⚡', '🔬',
  '👥', '📣', '🏆', '💡', '📁', '🌍', '🔥', '✨', '🎓', '🏠',
  '📈', '🤝', '🧪', '🎮', '📱', '💻', '🛡️', '⭐', '🌊', '🍀',
  '🦊', '🐝',
] as const

type Props = {
  value: string
  onChange: (emoji: string) => void
  size?: 'sm' | 'md'
}

const LABELS: Record<string, string> = {
  '🏢': 'office building',
  '🚀': 'rocket',
  '💼': 'briefcase',
  '🎯': 'target',
  '📊': 'chart',
  '🛠️': 'tools',
  '🎨': 'art',
  '🌱': 'seedling',
  '⚡': 'lightning',
  '🔬': 'microscope',
  '👥': 'people',
  '📣': 'megaphone',
  '🏆': 'trophy',
  '💡': 'lightbulb',
  '📁': 'folder',
  '🌍': 'globe',
  '🔥': 'fire',
  '✨': 'sparkles',
  '🎓': 'graduation',
  '🏠': 'home',
  '📈': 'trending',
  '🤝': 'handshake',
  '🧪': 'lab',
  '🎮': 'game',
  '📱': 'mobile',
  '💻': 'laptop',
  '🛡️': 'shield',
  '⭐': 'star',
  '🌊': 'wave',
  '🍀': 'clover',
  '🦊': 'fox',
  '🐝': 'bee',
}

export function EmojiPicker({ value, onChange, size = 'md' }: Props) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...EMOJI_PALETTE]
    return EMOJI_PALETTE.filter((emoji) => (LABELS[emoji] ?? '').includes(q) || emoji.includes(q))
  }, [query])

  return (
    <div className="grid gap-2">
      <Input
        placeholder="Search emojis…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="tl-input h-8 text-sm"
      />
      <div className={`flex flex-wrap gap-2 ${size === 'sm' ? 'max-w-xs' : ''}`}>
        {filtered.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={LABELS[emoji] ?? emoji}
            className="rounded-md border px-2 py-1 text-lg transition"
            style={{
              borderColor: value === emoji ? 'var(--primary)' : 'var(--border-subtle)',
              background: value === emoji ? 'var(--primary-soft)' : 'var(--bg-elevated)',
            }}
            onClick={() => onChange(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
