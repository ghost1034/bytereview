'use client'

/**
 * Render text with bold matching substrings.
 */
import { splitHighlight } from '../../lib/search/highlight'

type Props = {
  text: string
  query: string
}

export function HighlightText({ text, query }: Props) {
  const parts = splitHighlight(text, query)
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} style={{ color: 'hsl(var(--foreground))' }}>
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}
