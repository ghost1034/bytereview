'use client'

import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CreateJobModal } from '@/components/jobs/create-job-modal'
import JobCard from '@/components/jobs/JobCard'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useJobs } from '@/hooks/useJobs'
import { useToast } from '@/hooks/use-toast'

export function JobsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const { toast } = useToast()

  const offset = (currentPage - 1) * pageSize

  const { data: jobsData, isLoading: loading, refetch } = useJobs(
    pageSize,
    offset,
  )
  const jobs = jobsData?.jobs || []
  const totalJobs = jobsData?.total || 0
  const totalPages = Math.ceil(totalJobs / pageSize)

  const handleJobDelete = () => {
    refetch()
  }

  const handleRefresh = async () => {
    const result = await refetch()
    if (!result.error) {
      toast({
        title: 'Jobs updated',
        description: `Refreshed at ${new Date().toLocaleTimeString()}`,
      })
    } else {
      toast({
        title: 'Refresh failed',
        description: 'Could not load jobs. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Document Analysis"
        title="Jobs"
        description="Manage your document extraction jobs across this workspace."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Refresh jobs list"
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Refresh
            </Button>
            <Button onClick={() => setShowCreateModal(true)} size="sm" data-tour="jobs-new-job-button">
              <Plus className="mr-1.5 size-4" aria-hidden />
              New job
            </Button>
          </>
        }
      />

      <Section
        variant="card"
        title={`All jobs${loading ? '' : ` (${totalJobs} total)`}`}
        description="Your latest extraction work."
      >
        {loading ? (
          <LoadingState variant="list" rows={5} label="Loading jobs" />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={totalJobs === 0 ? 'No jobs yet' : 'No jobs found'}
            description={
              totalJobs === 0
                ? 'Create your first job to start extracting data from documents.'
                : 'No jobs match the current filters.'
            }
            action={
              totalJobs === 0 ? (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="mr-1.5 size-4" aria-hidden />
                  Create your first job
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid gap-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onDelete={handleJobDelete}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-muted">Show</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(parseInt(value, 10))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="h-8 w-20" aria-label="Items per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-foreground-muted">per page</span>
                </div>

                <p className="text-xs tabular-nums text-foreground-muted">
                  Page {currentPage} of {totalPages} ({totalJobs} total)
                </p>

                <nav
                  aria-label="Pagination"
                  className="flex items-center gap-1"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      const isCurrent = currentPage === pageNum
                      return (
                        <Button
                          key={pageNum}
                          variant={isCurrent ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          aria-label={`Page ${pageNum}`}
                          aria-current={isCurrent ? 'page' : undefined}
                          className="size-8 p-0 tabular-nums"
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Button>
                </nav>
              </div>
            )}
          </>
        )}
      </Section>

      <CreateJobModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    </div>
  )
}
