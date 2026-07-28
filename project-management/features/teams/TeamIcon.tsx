'use client'

/** 20px team icon tile with hashed background color. */
import { colorForName } from '../../lib/colors'

type Props = {
  name: string
  emoji?: string
  className?: string
}

export function TeamIcon({ name, emoji = '👥', className = '' }: Props) {
  const bg = colorForName(name)
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs ${className}`}
      style={{ background: `${bg}33` }}
      aria-hidden
    >
      {emoji}
    </span>
  )
}
