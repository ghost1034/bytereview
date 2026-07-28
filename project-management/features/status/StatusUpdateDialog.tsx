'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MagicButton, draftStatusUpdateFromActivity } from '../ai'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postStatusUpdate } from '../../lib/statusUpdateActions'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import type { Project, ProjectStatus } from '../../types'
import { countTasksAddedSince, summarizeProjectActivity } from './summaries'
import { RichTextBlock } from './RichTextBlock'
import { StatusDataPrompts } from './StatusDataPrompts'
import { StatusSegmentPicker } from './StatusSegmentPicker'

type Props = {
  project: Project
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPosted?: () => void
}

function defaultTitle(projectName: string): string {
  return `Weekly status — ${projectName} — ${format(new Date(), 'MMM d, yyyy')}`
}

function wrapHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return sanitizeHtml(trimmed.startsWith('<') ? trimmed : `<p>${trimmed}</p>`)
}

/** Full status update composer dialog with rich sections and activity prompts. */
export function StatusUpdateDialog({ project, currentUserId, open, onOpenChange, onPosted }: Props) {
  const [status, setStatus] = useState<Exclude<ProjectStatus, null>>(project.status ?? 'on_track')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [highlights, setHighlights] = useState('')
  const [blockers, setBlockers] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [showHighlights, setShowHighlights] = useState(false)
  const [showBlockers, setShowBlockers] = useState(false)
  const [showNextSteps, setShowNextSteps] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [drafting, setDrafting] = useState(false)

  const draftFromActivity = async () => {
    setDrafting(true)
    try {
      const draft = await draftStatusUpdateFromActivity(project.id)
      setStatus(draft.status)
      setTitle(draft.title)
      setSummary(draft.summary)
      if (draft.highlights) {
        setHighlights(draft.highlights)
        setShowHighlights(true)
      }
      if (draft.blockers) {
        setBlockers(draft.blockers)
        setShowBlockers(true)
      }
      if (draft.nextSteps) {
        setNextSteps(draft.nextSteps)
        setShowNextSteps(true)
      }
    } finally {
      setDrafting(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setStatus(project.status ?? 'on_track')
    setTitle(defaultTitle(project.name))
    setSummary('')
    setHighlights('')
    setBlockers('')
    setNextSteps('')
  }, [open, project.name, project.status])

  const digest = useMemo(() => summarizeProjectActivity(project.id), [project.id, open])
  const tasksAdded = useMemo(
    () => countTasksAddedSince(project.id, new Date(Date.now() - 7 * 86400000).toISOString()),
    [project.id, open]
  )

  const submit = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await postStatusUpdate({
        projectId: project.id,
        authorId: currentUserId,
        status,
        title,
        summaryHtml: wrapHtml(summary) || '<p>No summary provided.</p>',
        highlightsHtml: wrapHtml(highlights) || undefined,
        blockersHtml: wrapHtml(blockers) || undefined,
        nextStepsHtml: wrapHtml(nextSteps) || undefined,
      })
      onOpenChange(false)
      onPosted?.()
    } finally {
      setSubmitting(false)
    }
  }

  const SectionToggle = ({
    label,
    open: sectionOpen,
    onToggle,
    children,
  }: {
    label: string
    open: boolean
    onToggle: () => void
    children: ReactNode
  }) => (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium"
        style={{ color: 'var(--ink-secondary)' }}
        onClick={onToggle}
      >
        {sectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {sectionOpen ? children : null}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface tl-dialog-mobile max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="font-serif">Post status update</DialogTitle>
            <MagicButton label={drafting ? 'Drafting…' : 'Draft from activity'} onClick={() => void draftFromActivity()} disabled={drafting} />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <StatusSegmentPicker value={status} onChange={setStatus} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-title">Title</Label>
            <Input id="status-title" className="tl-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <StatusDataPrompts digest={digest} tasksAdded={tasksAdded} />

          <div className="space-y-2">
            <Label>Summary</Label>
            <RichTextBlock html={summary} onChange={setSummary} placeholder="What's the overall status?" minHeight="min-h-24" />
          </div>

          <SectionToggle label="Highlights" open={showHighlights} onToggle={() => setShowHighlights((v) => !v)}>
            <RichTextBlock html={highlights} onChange={setHighlights} placeholder="Wins this period…" />
          </SectionToggle>
          <SectionToggle label="Blockers" open={showBlockers} onToggle={() => setShowBlockers((v) => !v)}>
            <RichTextBlock html={blockers} onChange={setBlockers} placeholder="What's in the way?" />
          </SectionToggle>
          <SectionToggle label="Next steps" open={showNextSteps} onToggle={() => setShowNextSteps((v) => !v)}>
            <RichTextBlock html={nextSteps} onChange={setNextSteps} placeholder="What's coming next?" />
          </SectionToggle>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={!title.trim() || submitting} onClick={() => void submit()}>
            Post update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
