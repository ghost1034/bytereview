'use client'

/** Step 5 — finish summary before provisioning. */
import { CheckCircle2 } from 'lucide-react'

type Props = {
  companyName: string
  industries: string[]
  templateCount: number
  inviteCount: number
  notice?: string | null
}

export function StepFinish({ companyName, industries, templateCount, inviteCount, notice }: Props) {
  const industryLabel = industries.length ? industries.join(', ') : 'general'
  const items = [
    `${companyName || 'Your workspace'} with ${industryLabel} defaults`,
    templateCount > 0 ? `${templateCount} starter project(s) from templates` : 'No starter projects (blank start)',
    inviteCount > 0 ? `${inviteCount} teammate invite(s) queued` : 'Teammate invites skipped',
    'Priority & Status custom fields seeded globally',
    'Welcome message in your Inbox',
  ]

  return (
    <div className="space-y-4 py-4">
      <p className="font-sans text-lg text-foreground">
        You&apos;re almost there
      </p>
      {notice ? (
        <p className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
          {notice}
        </p>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
