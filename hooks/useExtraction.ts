'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, type TemplatesResponse, type FieldConfig } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export function useTemplates() {
  const { user } = useAuth()
  
  return useQuery<TemplatesResponse>({
    queryKey: ['templates', user?.uid],
    queryFn: () => apiClient.getTemplates(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}

export function usePublicTemplates() {
  return useQuery({
    queryKey: ['public-templates'],
    queryFn: () => apiClient.getPublicTemplates(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  
  return useMutation({
    mutationFn: (templateData: {
      name: string
      description?: string
      fields: FieldConfig[]
      is_public?: boolean
      template_type?: 'extraction' | 'cpe'
    }) => apiClient.createTemplate({
      ...(templateData as any),
      is_public: templateData.is_public ?? false,
    } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.uid] })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  
  return useMutation({
    mutationFn: ({ templateId, templateData }: { 
      templateId: string
      templateData: {
        name?: string
        description?: string
        fields?: FieldConfig[]
        is_public?: boolean
      }
    }) => apiClient.updateTemplate(templateId, templateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.uid] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  
  return useMutation({
    mutationFn: (templateId: string) => apiClient.deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.uid] })
    },
  })
}

// Re-export types for convenience
export type { FieldConfig, TemplatesResponse } from '@/lib/api'
