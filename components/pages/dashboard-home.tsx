'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Briefcase,
  FileText,
  Plus,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ActionCard } from '@/components/ui/action-card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { JobRow } from '@/components/ui/job-row'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { apiClient } from '@/lib/api'
import { useCurrentUser } from '@/hooks/useUserProfile'
import UsageStats from '@/components/subscription/UsageStats'
import type { JobStatus } from '@/components/ui/job-status-badge'
import { useProductTour } from '@/components/tour/product-tour'

interface RecentJob {
  id: string
  name?: string | null
  status: JobStatus
  created_at: string
}

export function DashboardHome() {
  const { user: userProfile, isLoading: userLoading } = useCurrentUser()
  const { startTour } = useProductTour()
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadRecentJobs = async () => {
      try {
        const jobsResponse = await apiClient.listJobs({ limit: 5, offset: 0 })
        if (!cancelled) {
          setRecentJobs((jobsResponse.jobs ?? []) as RecentJob[])
          setJobsError(null)
        }
      } catch (error) {
        console.error('Error loading recent jobs:', error)
        if (!cancelled) {
          setJobsError('We couldn’t load your recent jobs.')
          setRecentJobs([])
        }
      } finally {
        if (!cancelled) setJobsLoading(false)
      }
    }
    loadRecentJobs()
    return () => {
      cancelled = true
    }
  }, [])

  const greetingName =
    userProfile?.display_name || userProfile?.email?.split('@')[0] || 'there'

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title={
          userLoading
            ? 'Welcome back!'
            : `Welcome back, ${greetingName}`
        }
        description="Extract structured data from your documents with AI. Start a new job or continue where you left off."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={startTour}
              data-tour="dashboard-tour-button"
            >
              <Sparkles className="mr-1.5 size-4" aria-hidden />
              Take product tour
            </Button>
            <Button asChild>
              <Link href="/dashboard/jobs">
                <Plus className="mr-1.5 size-4" aria-hidden />
                New job
              </Link>
            </Button>
          </div>
        }
      />

      <Section
        title="Quick actions"
        description="Common workflows to get you moving."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            icon={Plus}
            title="Create a new job"
            description="Upload documents and configure extraction fields"
            href="/dashboard/jobs"
            tone="brand"
          />
          <ActionCard
            icon={FileText}
            title="Browse templates"
            description="Reuse pre-built extraction templates"
            href="/dashboard/templates"
            tone="success"
          />
          <ActionCard
            icon={Sparkles}
            title="Set up automations"
            description="Process emails sent to your inbox automatically"
            href="/dashboard/automations"
            tone="info"
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            variant="card"
            title="Recent jobs"
            description="Your latest extractions across this workspace."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/jobs">
                  View all
                  <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
                </Link>
              </Button>
            }
          >
            {jobsLoading ? (
              <LoadingState variant="list" rows={4} label="Loading recent jobs" />
            ) : jobsError ? (
              <ErrorState
                title="Couldn’t load recent jobs"
                description={jobsError}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setJobsLoading(true)
                      setJobsError(null)
                      apiClient
                        .listJobs({ limit: 5, offset: 0 })
                        .then((res) => {
                          setRecentJobs((res.jobs ?? []) as RecentJob[])
                          setJobsLoading(false)
                        })
                        .catch((err) => {
                          console.error(err)
                          setJobsError('We couldn’t load your recent jobs.')
                          setJobsLoading(false)
                        })
                    }}
                  >
                    Try again
                  </Button>
                }
              />
            ) : recentJobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No jobs yet"
                description="Create your first job to start extracting data from documents, or set up automations to process emails sent to document@cpaautomation.ai."
                action={
                  <Button asChild>
                    <Link href="/dashboard/jobs">
                      <Plus className="mr-1.5 size-4" aria-hidden />
                      Create your first job
                    </Link>
                  </Button>
                }
                secondaryAction={
                  <Button asChild variant="outline">
                    <Link href="/dashboard/automations">
                      Configure automations
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {recentJobs.slice(0, 5).map((job) => (
                  <li key={job.id}>
                    <JobRow
                      id={job.id}
                      name={job.name || `Job ${job.id}`}
                      status={job.status}
                      createdAt={job.created_at}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="lg:col-span-1">
          <UsageStats />
        </div>
      </div>
    </div>
  )
}
