'use client'

/** Chat input with quick prompts and send button. */
import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AiContextChips } from './AiContextChips'
import { getQuickPrompts } from './AiQuickPrompts'
import type { AiContextScope } from '../../lib/ai/types'

type Props = {
  scope: AiContextScope | null
  disabled?: boolean
  onSend: (prompt: string) => void
}

export function AiInputArea({ scope, disabled, onSend }: Props) {
  const [prompt, setPrompt] = useState('')
  const chips = getQuickPrompts(scope)

  const submit = () => {
    if (!prompt.trim() || disabled) return
    onSend(prompt)
    setPrompt('')
  }

  return (
    <footer className="shrink-0 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
      <AiContextChips scope={scope} />
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            className="rounded-full px-2.5 py-1 text-xs transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
            onClick={() => onSend(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-2 p-3 pt-0">
        <Textarea
          value={prompt}
          disabled={disabled}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={disabled ? 'AI is paused' : 'Ask Project Management AI…'}
          className="min-h-[72px] flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          className="tl-btn-primary h-auto shrink-0 self-end border-0"
          disabled={disabled || !prompt.trim()}
          aria-label="Send"
          onClick={submit}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </footer>
  )
}
