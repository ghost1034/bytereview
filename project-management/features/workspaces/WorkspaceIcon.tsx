'use client'

/** 24px workspace icon tile with hashed background color. */
import { colorForName } from '../../lib/colors'

type Props = {
  name: string
  emoji?: string
  className?: string
}

export function WorkspaceIcon({ name, emoji = '🏢', className = '' }: Props) {
  const bg = colorForName(name)
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm ${className}`}
      style={{ background: `${bg}33` }}
      aria-hidden
    >
      {emoji}
    </span>
  )
}
