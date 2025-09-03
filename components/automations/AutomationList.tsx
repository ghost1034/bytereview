"use client"

import { useState } from "react"
import { Plus, Settings, Play, Pause, Trash2, Eye, Calendar, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutomations, useToggleAutomation, useDeleteAutomation } from "@/hooks/useAutomations"
import { AutomationModal } from "./AutomationModal"
import { AutomationRunsModal } from "./AutomationRunsModal"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { formatDistanceToNow } from "date-fns"

export function AutomationList() {
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [runsModalOpen, setRunsModalOpen] = useState(false)
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null)

  const { data: automations, isLoading, error } = useAutomations()
  const toggleAutomation = useToggleAutomation()
  const deleteAutomation = useDeleteAutomation()

  const handleEdit = (automationId: string) => {
    setSelectedAutomationId(automationId)
    setEditModalOpen(true)
  }

  const handleViewRuns = (automationId: string) => {
    setSelectedAutomationId(automationId)
    setRunsModalOpen(true)
  }

  const handleToggle = (automationId: string) => {
    toggleAutomation.mutate(automationId)
  }

  const handleDelete = (automationId: string) => {
    deleteAutomation.mutate(automationId)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load automations. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Automations</h1>
          <p className="text-gray-600 mt-2">
            Automated workflows that trigger when you receive emails with attachments
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Automation
        </Button>
      </div>

      {!automations || automations.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Automations Yet</h3>
            <p className="text-gray-600 mb-4">
              Create automated workflows that trigger when you receive emails with attachments
            </p>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Automation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {automations.map((automation) => (
            <Card key={automation.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {automation.name}
                      <Badge variant={automation.is_enabled ? "default" : "secondary"}>
                        {automation.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Gmail trigger: {automation.trigger_config.query}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewRuns(automation.id)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(automation.id)}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(automation.id)}
                      disabled={toggleAutomation.isPending}
                    >
                      {automation.is_enabled ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Automation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{automation.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(automation.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Created {formatDistanceToNow(new Date(automation.created_at), { addSuffix: true })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Updated {formatDistanceToNow(new Date(automation.updated_at), { addSuffix: true })}
                    </div>
                  </div>
                  
                  {automation.dest_type && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        Export to {automation.dest_type === 'gdrive' ? 'Google Drive' : 'Gmail'}
                      </Badge>
                      {automation.export_config?.folder_id && (
                        <span className="text-sm text-gray-600">
                          Folder: {automation.export_config.folder_id}
                        </span>
                      )}
                      {automation.export_config?.to_email && (
                        <span className="text-sm text-gray-600">
                          Email: {automation.export_config.to_email}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AutomationModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />

      {selectedAutomationId && (
        <>
          <AutomationModal
            automationId={selectedAutomationId}
            open={editModalOpen}
            onOpenChange={setEditModalOpen}
          />
          <AutomationRunsModal
            automationId={selectedAutomationId}
            open={runsModalOpen}
            onOpenChange={setRunsModalOpen}
          />
        </>
      )}
    </div>
  )
}