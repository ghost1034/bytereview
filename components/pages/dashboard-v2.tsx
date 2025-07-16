/**
 * New Dashboard with Multi-Step Job Workflow
 * Replaces the old single-page dashboard
 */
'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  History, 
  Settings, 
  FileText, 
  Clock,
  CheckCircle,
  XCircle,
  BarChart3
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useJobs } from "@/hooks/useJobs";
import { useCurrentUser } from "@/hooks/useUserProfile";

// Import workflow and supporting components
import JobWorkflow from "@/components/workflow/JobWorkflow";
import UsageStats from "@/components/subscription/UsageStats";
import SubscriptionManager from "@/components/subscription/SubscriptionManager";
import TemplateLibrary from "@/components/templates/TemplateLibrary";

export default function Dashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("new-extraction");
  const { user: userProfile, isLoading: userLoading, error: userError } = useCurrentUser();
  
  const { data: jobs, isLoading: jobsLoading } = useJobs(10, 0);

  const handleJobComplete = (jobId: string) => {
    toast({
      title: "Extraction Complete!",
      description: `Job ${jobId} has finished processing. View your results below.`
    });
    
    // Switch to job history tab to show completed job
    setActiveTab("job-history");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {userLoading ? (
                  'Loading...'
                ) : userError ? (
                  'Welcome back, User'
                ) : (
                  `Welcome back, ${userProfile?.display_name || 'User'}`
                )}
              </h1>
              <p className="text-gray-600 mt-1">
                Extract structured data from your documents using AI
              </p>
              {userError && (
                <p className="text-red-600 text-sm mt-1">
                  Profile sync error: {userError.message}
                </p>
              )}
            </div>
            <UsageStats />
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="new-extraction" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Extraction
            </TabsTrigger>
            <TabsTrigger value="job-history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Job History
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* New Extraction Tab */}
          <TabsContent value="new-extraction">
            <JobWorkflow onJobComplete={handleJobComplete} />
          </TabsContent>

          {/* Job History Tab */}
          <TabsContent value="job-history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Recent Jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {jobsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-500 mt-2">Loading jobs...</p>
                  </div>
                ) : jobs?.jobs && jobs.jobs.length > 0 ? (
                  <div className="space-y-4">
                    {jobs.jobs.map((job) => (
                      <div key={job.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(job.status)}
                            <div>
                              <h3 className="font-medium">
                                {job.name || `Job ${job.id.slice(0, 8)}`}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {formatDate(job.created_at)} • {job.file_count} files
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(job.status)}>
                              {job.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs yet</h3>
                    <p className="text-gray-500 mb-4">
                      Start your first extraction job to see it here
                    </p>
                    <Button onClick={() => setActiveTab("new-extraction")}>
                      <Plus className="w-4 h-4 mr-2" />
                      Start New Extraction
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates">
            <TemplateLibrary />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <p className="text-gray-600">{userProfile?.email || 'Loading...'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Display Name</label>
                      <p className="text-gray-600">{userProfile?.display_name || 'Not set'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <SubscriptionManager />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}