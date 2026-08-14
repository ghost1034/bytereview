'use client'

/** FormListItem — sidebar row with publish, copy link, and open actions. */
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { publicFormUrl } from '../../lib/forms/publicFormUrl'
import { useFormSubmissionsStore } from '../../stores/entities'
import type { Form } from '../../types'
import { formatDistanceToNow } from 'date-fns'

type ItemProps = {
  form: Form
  selected: boolean
  onSelect: () => void
}

/** Compact form row in the workspace forms list. */
export function FormListItem({ form, selected, onSelect }: ItemProps) {
  const submissions = useFormSubmissionsStore((s) => s.list().filter((sub) => sub.formId === form.id))
  const lastSub = submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg border p-3 text-left transition-colors"
      style={{
        borderColor: selected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        background: selected ? 'hsl(var(--primary-soft))' : 'hsl(var(--card))',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium truncate">{form.name}</p>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {form.isPublic ? 'Published' : 'Draft'}
        </Badge>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {submissions.length} submission{submissions.length === 1 ? '' : 's'}
        {lastSub ? ` · ${formatDistanceToNow(new Date(lastSub.createdAt), { addSuffix: true })}` : ''}
      </p>
    </button>
  )
}

type ActionsProps = {
  form: Form
  onPublish: () => void
  onUnpublish: () => void
}

/** Publish / share action buttons for the form editor header. */
export function FormListItemActions({ form, onPublish, onUnpublish }: ActionsProps) {
  const [copied, setCopied] = useState(false)
  const url = publicFormUrl(form.id)

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {form.isPublic ? (
        <>
          <Button variant="outline" size="sm" onClick={onUnpublish}>Unpublish</Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => void copyUrl()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy link
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </>
      ) : (
        <Button className=" border-0" size="sm" onClick={onPublish}>
          Publish
        </Button>
      )}
    </div>
  )
}
