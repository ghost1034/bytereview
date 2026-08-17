'use client'

import { useState } from 'react'
import { Download, FileText, Loader2, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useGenerateVarianceMemo,
  useUpdateAnalyticsVariance,
} from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import { exportMemoToPdf, exportMemoToWord } from '@/lib/analytics/memoExport'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import { readVarianceData } from '@/lib/analytics/varianceTypes'

interface VarianceMemoTabProps {
  record: AnalyticsAnalysis
}

export function VarianceMemoTab({ record }: VarianceMemoTabProps) {
  const { toast } = useToast()
  const memoMutation = useGenerateVarianceMemo()
  const updateMutation = useUpdateAnalyticsVariance()
  const [isExporting, setIsExporting] = useState<'word' | 'pdf' | null>(null)

  const memo = record.memo_content ?? ''
  const data = readVarianceData(record)
  const processed = data.processed ?? []
  const canExport = record.status === 'Approved' || record.status === 'Finalized'

  const handleGenerate = async () => {
    if (processed.length === 0) {
      toast({ title: 'Run the analysis first', variant: 'destructive' })
      return
    }
    try {
      const response = await memoMutation.mutateAsync({
        analysisId: record.id,
      })
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: { memo_content: response.text, status: 'Draft' },
      })
      toast({
        title: 'Draft memo generated',
        description: 'Review and approve the analysis before exporting the memo.',
      })
    } catch (error) {
      toast({
        title: 'Memo generation failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const handleExport = async (format: 'word' | 'pdf') => {
    if (!memo) {
      toast({ title: 'Nothing to export' })
      return
    }
    if (!canExport) {
      toast({
        title: 'Approval required',
        description: 'Review and approve the analysis before exporting this draft.',
      })
      return
    }
    setIsExporting(format)
    try {
      const filename = `${record.name.replace(/[^\w-]+/g, '_')}_memo`
      if (format === 'word') await exportMemoToWord(memo, filename)
      else await exportMemoToPdf(memo, filename)
      toast({ title: `Exported as ${format === 'word' ? 'Word' : 'PDF'}` })
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">Variance memo</div>
          <div className="text-xs text-foreground-muted">
            AI-generated markdown reviewing flagged variances and methodology.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={memoMutation.isPending}
          >
            {memoMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="mr-1.5 size-4" aria-hidden />
            )}
            {memo ? 'Regenerate memo' : 'Generate memo'}
          </Button>
          {memo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting !== null || !canExport}
                  title={canExport ? undefined : 'Approve the analysis before exporting this draft'}
                >
                  {isExporting ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="mr-1.5 size-4" aria-hidden />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('word')}>
                  <FileText className="mr-2 size-4" aria-hidden /> Word (.docx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  <FileText className="mr-2 size-4" aria-hidden /> PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {memo ? (
        <div className="space-y-3">
          {!canExport && (
            <Alert>
              <AlertTitle>Review-required draft</AlertTitle>
              <AlertDescription>
                Verify the generated statements against the source rows, then approve the analysis
                to enable Word or PDF export.
              </AlertDescription>
            </Alert>
          )}
          <article className="prose prose-sm max-w-none rounded-xl border border-border bg-card p-6 dark:prose-invert">
            <ReactMarkdown>{memo}</ReactMarkdown>
          </article>
        </div>
      ) : (
        <Alert>
          <AlertTitle>No memo yet</AlertTitle>
          <AlertDescription>
            Generate a memo to draft a structured write-up of methodology, material variances, and
            recommendations.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default VarianceMemoTab
