'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, type TemplatesResponse, type ExtractionResponse, type FieldConfig } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

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
    }): Promise<ExtractionResponse> => {
      return apiClient.extractFromFiles(files, fields, extractMultipleRows)
    },
    onSuccess: () => {
      // Invalidate user usage data after successful extraction
      queryClient.invalidateQueries({ queryKey: ['user-usage'] })
    },
  })
}

export function useExtractFromUploaded() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({
      fileIds,
      fields,
      extractMultipleRows = false
    }: {
      fileIds: string[]
      fields: FieldConfig[]
      extractMultipleRows?: boolean
    }): Promise<ExtractionResponse> => {
      return apiClient.extractFromUploadedFiles(fileIds, fields, extractMultipleRows) as any
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-usage'] })
    },
  })
}

export function useUploadFiles() {
  return useMutation({
    mutationFn: (files: File[]) => apiClient.uploadFiles(files),
  })
}

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
    }) => apiClient.createTemplate({
      ...templateData,
      is_public: templateData.is_public ?? false
    }),
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

export function useExportToCSV() {
  return useMutation({
    mutationFn: (extractionData: any) => apiClient.exportToCSV(extractionData),
  })
}

export function useExportToExcel() {
  return useMutation({
    mutationFn: (extractionData: any) => apiClient.exportToExcel(extractionData),
  })
}

// Re-export types for convenience
export type { FieldConfig, ExtractionResponse, TemplatesResponse } from '@/lib/api'