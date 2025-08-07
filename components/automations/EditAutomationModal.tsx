"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutomation, useUpdateAutomation } from "@/hooks/useAutomations"
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration"
import { Mail, FileText, Upload, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const editAutomationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  gmail_query: z.string().min(1, "Gmail query is required"),
  is_enabled: z.boolean(),
  dest_type: z.enum(["", "gdrive", "gmail"]).optional(),
  folder_id: z.string().optional(),
  to_email: z.string().email("Invalid email address").optional().or(z.literal("")),
  file_type: z.enum(["csv", "xlsx"]).default("csv"),
})

type EditAutomationFormData = z.infer<typeof editAutomationSchema>

interface EditAutomationModalProps {
  automationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditAutomationModal({ automationId, open, onOpenChange }: EditAutomationModalProps) {
  const { data: automation, isLoading } = useAutomation(automationId)
  const { status: googleStatus } = useGoogleIntegration()
  const updateAutomation = useUpdateAutomation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid, isDirty }
  } = useForm<EditAutomationFormData>({
    resolver: zodResolver(editAutomationSchema),
    mode: "onChange"
  })

  const watchedDestType = watch("dest_type")

  // Reset form when automation data loads
  useEffect(() => {
    if (automation) {
      reset({
        name: automation.name,
        gmail_query: automation.trigger_config.query,
        is_enabled: automation.is_enabled,
        dest_type: automation.dest_type || "",
        folder_id: automation.export_config?.folder_id || "",
        to_email: automation.export_config?.to_email || "",
        file_type: automation.export_config?.file_type || "csv",
      })
    }
  }, [automation, reset])

  const onSubmit = async (data: EditAutomationFormData) => {
    try {
      const updateData = {
        name: data.name,
        is_enabled: data.is_enabled,
        trigger_config: {
          query: data.gmail_query
        },
        dest_type: data.dest_type || undefined,
        export_config: data.dest_type ? {
          ...(data.dest_type === "gdrive" && data.folder_id ? { folder_id: data.folder_id } : {}),
          ...(data.dest_type === "gdrive" ? { file_type: data.file_type } : {}),
          ...(data.dest_type === "gmail" && data.to_email ? { to_email: data.to_email } : {}),
        } : undefined
      }

      await updateAutomation.mutateAsync({ id: automationId, data: updateData })
      onOpenChange(false)
    } catch (error) {
      // Error handling is done in the mutation
    }
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Automation</DialogTitle>
            <DialogDescription>
              Update your automation configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!automation) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Automation</DialogTitle>
          <DialogDescription>
            Update your automation configuration
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Automation Name</Label>
              <Input
                id="name"
                placeholder="e.g., Process Invoice Attachments"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="gmail_query">Gmail Search Query</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        <p className="font-medium mb-2">Gmail Query Examples:</p>
                        <ul className="text-sm space-y-1">
                          <li>• <code>has:attachment</code> - Any email with attachments</li>
                          <li>• <code>from:supplier@company.com has:attachment</code> - From specific sender</li>
                          <li>• <code>subject:invoice has:attachment</code> - Subject contains "invoice"</li>
                          <li>• <code>has:attachment filename:pdf</code> - PDF attachments only</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                id="gmail_query"
                placeholder="has:attachment from:invoices@supplier.com"
                rows={3}
                {...register("gmail_query")}
              />
              {errors.gmail_query && (
                <p className="text-sm text-red-600">{errors.gmail_query.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_enabled"
                checked={watch("is_enabled")}
                onCheckedChange={(checked) => setValue("is_enabled", checked)}
              />
              <Label htmlFor="is_enabled">Enable automation</Label>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Export Results</Label>
                <p className="text-sm text-gray-600 mb-3">
                  Choose where to automatically export the extraction results
                </p>
                
                <div className="grid gap-3">
                  <Card 
                    className={`cursor-pointer transition-colors ${watchedDestType === "" ? "ring-2 ring-blue-500" : ""}`}
                    onClick={() => setValue("dest_type", "", { shouldDirty: true })}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-medium">No automatic export</h4>
                          <p className="text-sm text-gray-600">Results will be available in the dashboard only</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card 
                    className={`cursor-pointer transition-colors ${
                      watchedDestType === "gdrive" ? "ring-2 ring-blue-500" : 
                      !googleStatus?.connected ? "opacity-50" : ""
                    }`}
                    onClick={() => googleStatus?.connected && setValue("dest_type", "gdrive", { shouldDirty: true })}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Upload className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">Export to Google Drive</h4>
                          <p className="text-sm text-gray-600">Automatically save results as CSV/Excel files</p>
                        </div>
                        {!googleStatus?.connected && (
                          <Badge variant="outline">Google Drive not connected</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                </div>
              </div>

              {/* Google Drive Export Configuration */}
              {watchedDestType === "gdrive" && (
                <div className="space-y-4 mt-4 p-4 bg-blue-50 rounded-lg border">
                  <h4 className="font-medium text-blue-900">Google Drive Export Settings</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="file_type">File Format</Label>
                    <Select
                      value={watch("file_type") || "csv"}
                      onValueChange={(value: "csv" | "xlsx") => setValue("file_type", value, { shouldDirty: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select file format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV (.csv)</SelectItem>
                        <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-600">
                      Choose the format for exported files
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!isValid || !isDirty || updateAutomation.isPending}
            >
              {updateAutomation.isPending ? "Updating..." : "Update Automation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}