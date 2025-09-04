import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export interface Automation {
  id: string
  user_id: string
  name: string
  is_enabled: boolean
  trigger_type: string
  trigger_config: {
    query: string
  }
  job_id: string
  processing_mode?: 'individual' | 'combined'
  keep_source_files?: boolean
  dest_type?: string
  export_config?: {
    folder_id?: string
    folder_name?: string
    to_email?: string
    file_type?: 'csv' | 'xlsx'
  }
  created_at: string
  updated_at: string
}

export interface AutomationRun {
  id: string
  automation_id: string
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error_message?: string
  triggered_at: string
  completed_at?: string
}

export interface CreateAutomationData {
  name: string
  is_enabled: boolean
  trigger_type: string
  trigger_config: {
    query: string
  }
  job_id: string
  processing_mode?: 'individual' | 'combined'
  keep_source_files?: boolean
  dest_type?: string
  export_config?: {
    folder_id?: string
    folder_name?: string
    to_email?: string
    file_type?: 'csv' | 'xlsx'
  }
}

export interface UpdateAutomationData {
  name?: string
  is_enabled?: boolean
  trigger_config?: {
    query?: string
  }
  processing_mode?: 'individual' | 'combined'
  keep_source_files?: boolean
  dest_type?: string
  export_config?: {
    folder_id?: string
    folder_name?: string
    to_email?: string
    file_type?: 'csv' | 'xlsx'
  }
}

export function useAutomations() {
  return useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const response = await apiClient.request('/api/automations')
      return response.automations as Automation[]
    },
  })
}

export function useAutomation(automationId: string) {
  return useQuery({
    queryKey: ['automation', automationId],
    queryFn: async () => {
      const response = await apiClient.request(`/api/automations/${automationId}`)
      return response as Automation
    },
    enabled: !!automationId,
  })
}

export function useAutomationRuns(automationId: string) {
  return useQuery({
    queryKey: ['automation-runs', automationId],
    queryFn: async () => {
      const response = await apiClient.request(`/api/automations/${automationId}/runs`)
      return response.runs as AutomationRun[]
    },
    enabled: !!automationId,
  })
}

export function useCreateAutomation() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (data: CreateAutomationData) => {
      const response = await apiClient.request('/api/automations', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      return response as Automation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      toast({
        title: 'Automation created',
        description: 'Your automation has been created successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create automation',
        description: error.message || 'An error occurred while creating the automation.',
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAutomationData }) => {
      const response = await apiClient.request(`/api/automations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      return response as Automation
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', id] })
      toast({
        title: 'Automation updated',
        description: 'Your automation has been updated successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update automation',
        description: error.message || 'An error occurred while updating the automation.',
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.request(`/api/automations/${id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      toast({
        title: 'Automation deleted',
        description: 'Your automation has been deleted successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete automation',
        description: error.message || 'An error occurred while deleting the automation.',
        variant: 'destructive',
      })
    },
  })
}

export function useToggleAutomation() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.request(`/api/automations/${id}/toggle`, {
        method: 'POST',
      })
      return response as Automation
    },
    onSuccess: (automation) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', automation.id] })
      toast({
        title: automation.is_enabled ? 'Automation enabled' : 'Automation disabled',
        description: `Your automation has been ${automation.is_enabled ? 'enabled' : 'disabled'}.`,
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to toggle automation',
        description: error.message || 'An error occurred while toggling the automation.',
        variant: 'destructive',
      })
    },
  })
}