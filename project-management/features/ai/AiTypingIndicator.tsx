'use client'

/** Three-dot typing wave while the assistant is generating. */
export function AiTypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2" aria-label="Project Management AI is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 0.15}s`, background: 'hsl(var(--primary))' }}
        />
      ))}
    </div>
  )
}
