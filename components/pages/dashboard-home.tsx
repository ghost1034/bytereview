'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FileText, 
  Briefcase, 
  Clock, 
  TrendingUp,
  Plus,
  ArrowRight,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api'
import { useCurrentUser } from '@/hooks/useUserProfile'

export function DashboardHome() {
  const { user: userProfile, isLoading: userLoading } = useCurrentUser()
  const [recentJobs, setRecentJobs] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  useEffect(() => {
    const loadRecentJobs = async () => {
      try {
        // Load recent jobs
        const jobsResponse = await apiClient.listJobs({ limit: 5, offset: 0 })
        setRecentJobs(jobsResponse.jobs || [])
      } catch (error) {
        console.error('Error loading recent jobs:', error)
        setRecentJobs([])
      } finally {
        setJobsLoading(false)
      }
    }

    loadRecentJobs()
  }, [])

  // TODO: Replace with actual usage data
  const usageStats = {
    documentsProcessed: 0,
    jobsCompleted: 0,
    templatesCreated: 0,
    monthlyLimit: 1000
  }

  // Recent jobs are now loaded from API in useEffect

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {userLoading ? 'Loading...' : userProfile?.display_name || userProfile?.email || 'User'}!
        </h1>
        <p className="text-gray-600 mt-2">
          Ready to extract data from your documents? Let's get started.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/dashboard/jobs" className="block">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Plus className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Create New Job</h3>
                  <p className="text-sm text-gray-600">Start extracting data from documents</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/dashboard/templates" className="block">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Browse Templates</h3>
                  <p className="text-sm text-gray-600">Use pre-built extraction templates</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/dashboard/jobs" className="block">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">View Jobs</h3>
                  <p className="text-sm text-gray-600">Check your job history and results</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Documents Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <span className="text-2xl font-bold text-gray-900">
                {usageStats.documentsProcessed.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Jobs Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Briefcase className="w-5 h-5 text-green-500" />
              <span className="text-2xl font-bold text-gray-900">
                {usageStats.jobsCompleted.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Templates Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-purple-500" />
              <span className="text-2xl font-bold text-gray-900">
                {usageStats.templatesCreated.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Personal templates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Monthly Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              <span className="text-2xl font-bold text-gray-900">
                {Math.round((usageStats.documentsProcessed / usageStats.monthlyLimit) * 100)}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {usageStats.documentsProcessed} / {usageStats.monthlyLimit.toLocaleString()} docs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Jobs</CardTitle>
            <Link href="/dashboard/jobs">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">Loading recent jobs...</p>
            </div>
          ) : recentJobs.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first job to start extracting data from documents.
              </p>
              <Link href="/dashboard/jobs">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Job
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {recentJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{job.name || `Job ${job.id}`}</h4>
                      <p className="text-sm text-gray-500">
                        {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={job.status === 'completed' ? 'secondary' : 'outline'}>
                      {job.status}
                    </Badge>
                    <Link href={`/dashboard/jobs/${job.id}`}>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}