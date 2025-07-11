'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export interface FieldConfig {
  name: string
  data_type: string
  prompt: string
}

export interface ExtractionResult {
  success: boolean
  files_processed: Array<{
    filename: string
    size_bytes: number
    num_pages: number
    text_length: number
    metadata?: any
  }>
  extraction_result: {
    success: boolean
    data: any
    error?: string
    rows_extracted?: number
    ai_model?: string
    processing_time?: number
  }
  pages_used: number
  total_processing_time: number
  error?: string
}

export function useExtractData() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({
      files,
      fields,
      extractMultipleRows = false
    }: {
      files: File[]
      fields: FieldConfig[]
      extractMultipleRows?: boolean
    }): Promise<ExtractionResult> => {
      return apiClient.extractData(files, fields, extractMultipleRows)
    },
    onSuccess: () => {
      // Invalidate user usage data after successful extraction
      queryClient.invalidateQueries({ queryKey: ['user-usage'] })
    },
  })
}

export interface Template {
  id: string
  name: string
  description?: string
  fields: FieldConfig[]
  created_at: string
  updated_at: string
  is_public: boolean
  usage_count?: number
}

export interface TemplatesResponse {
  templates: Template[]
}

export function useTemplates() {
  const { user } = useAuth()
  
  return useQuery<TemplatesResponse>({
    queryKey: ['templates', user?.uid],
    queryFn: () => apiClient.getTemplates() as Promise<TemplatesResponse>,
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes - templates don't change frequently
    refetchOnWindowFocus: false, // Don't refetch when user switches back to tab
  })
}

export function usePublicTemplates() {
  return useQuery({
    queryKey: ['public-templates'],
    queryFn: () => apiClient.getPublicTemplates(),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
    }) => apiClient.createTemplate(templateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.uid] })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  
  return useMutation({
    mutationFn: ({ templateId, templateData }: { templateId: string; templateData: any }) =>
      apiClient.updateTemplate(templateId, templateData),
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