'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'

interface CreateJobModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateJobModal({ open, onOpenChange }: CreateJobModalProps) {
  const [jobName, setJobName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleCreateJob = async () => {
    if (!jobName.trim()) {
      toast({
        title: "Job name required",
        description: "Please enter a name for your job.",
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    try {
      // Create a new job with the provided name
      const response = await apiClient.initiateJob({
        files: [], // Start with no files - user will upload them in the workflow
        name: jobName.trim()
      })

      toast({
        title: "Job created successfully",
        description: `Job "${jobName}" has been created.`
      })

      // Close modal and navigate to the job workflow
      onOpenChange(false)
      router.push(`/dashboard/jobs/${response.job_id}`)
      
      // Reset form
      setJobName('')
      
    } catch (error) {
      console.error('Error creating job:', error)
      toast({
        title: "Failed to create job",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    setJobName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Give your extraction job a name to get started.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="job-name">Job Name *</Label>
            <Input
              id="job-name"
              placeholder="e.g., Invoice Processing Q1 2024"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleCreateJob()
                }
              }}
            />
          </div>
          
        </div>
        
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleCancel}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateJob}
            disabled={isCreating || !jobName.trim()}
          >
            {isCreating ? "Creating..." : "Start Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}