'use client'

/** PortfolioStatusDialog — portfolio-scoped status update composer. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postPortfolioStatusUpdate } from '../../lib/portfolios/portfolioStatusActions'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import type { ProjectStatus } from '../../types'
import { RichTextBlock } from '../status/RichTextBlock'
import { StatusSegmentPicker } from '../status/StatusSegmentPicker'
import { summarizeProjectActivity } from '../status/summaries'

type Props = {
  portfolio: EnrichedPortfolio
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPosted?: () => void
}

function wrapHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return sanitizeHtml(trimmed.startsWith('<') ? trimmed : `<p>${trimmed}</p>`)
}

export function PortfolioStatusDialog({ portfolio, currentUserId, open, onOpenChange, onPosted }: Props) {
  const [status, setStatus] = useState<Exclude<ProjectStatus, null>>(portfolio.status ?? 'on_track')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [highlights, setHighlights] = useState('')
  const [blockers, setBlockers] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [showHighlights, setShowHighlights] = useState(false)
  const [showBlockers, setShowBlockers] = useState(false)
  const [showNextSteps, setShowNextSteps] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const firstProjectId = portfolio.projectIds[0]

  useEffect(() => {
    if (!open) return
    setStatus(portfolio.status ?? 'on_track')
    setTitle(`Portfolio status — ${portfolio.name} — ${format(new Date(), 'MMM d, yyyy')}`)
    setSummary('')
    setHighlights('')
    setBlockers('')
    setNextSteps('')
  }, [open, portfolio.name, portfolio.status])

  const digest = useMemo(
    () => (firstProjectId ? summarizeProjectActivity(firstProjectId) : null),
    [firstProjectId, open]
  )

  const submit = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await postPortfolioStatusUpdate({
        portfolioId: portfolio.id,
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

  const SectionToggle = ({ label, open: sectionOpen, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) => (
    <div className="space-y-2">
      <button type="button" className="flex items-center gap-1 text-sm font-medium" style={{ color: 'hsl(var(--foreground-muted))' }} onClick={onToggle}>
        {sectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {sectionOpen ? children : null}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle className="font-sans">Post portfolio update</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Status</Label><StatusSegmentPicker value={status} onChange={setStatus} /></div>
          <div className="space-y-2">
            <Label htmlFor="pf-status-title">Title</Label>
            <Input id="pf-status-title" className="tl-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {digest && (
            <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              Sample activity: {digest.tasksCompleted.length} tasks completed recently across linked projects.
            </p>
          )}
          <div className="space-y-2">
            <Label>Summary</Label>
            <RichTextBlock html={summary} onChange={setSummary} placeholder="What's the overall portfolio status?" minHeight="min-h-24" />
          </div>
          <SectionToggle label="Highlights" open={showHighlights} onToggle={() => setShowHighlights((v) => !v)}>
            <RichTextBlock html={highlights} onChange={setHighlights} placeholder="Wins…" />
          </SectionToggle>
          <SectionToggle label="Blockers" open={showBlockers} onToggle={() => setShowBlockers((v) => !v)}>
            <RichTextBlock html={blockers} onChange={setBlockers} placeholder="Blockers…" />
          </SectionToggle>
          <SectionToggle label="Next steps" open={showNextSteps} onToggle={() => setShowNextSteps((v) => !v)}>
            <RichTextBlock html={nextSteps} onChange={setNextSteps} placeholder="Next steps…" />
          </SectionToggle>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={!title.trim() || submitting} onClick={() => void submit()}>Post update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
