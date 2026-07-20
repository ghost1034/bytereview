'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient, type EsignPowerFormCreateRequest } from '@/lib/api'

export function useTemplateVersions(templateId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'template-versions', templateId],
    queryFn: () => apiClient.listEsignTemplateVersions(templateId!),
    enabled: !!user && !!templateId,
  })
}

export function usePublishTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, expectedRevision }: { templateId: string; expectedRevision: number }) => apiClient.publishEsignTemplate(templateId, expectedRevision),
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: ['esign', 'template-versions', version.template_id] })
      queryClient.invalidateQueries({ queryKey: ['esign', 'templates'] })
    },
  })
}

export function useBulkJobs() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'bulk-jobs'], queryFn: () => apiClient.listEsignBulkJobs(),
    enabled: !!user, refetchInterval: 10_000 })
}

export function useBulkJob(jobId?: string) {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'bulk-job', jobId], queryFn: () => apiClient.getEsignBulkJob(jobId!),
    enabled: !!user && !!jobId, refetchInterval: 5_000 })
}

export function useCreateBulkJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateVersionId, file, defaultSchedule }: { templateVersionId: string; file: File; defaultSchedule?: { at: string; timezone: string } }) =>
      apiClient.createEsignBulkJob(templateVersionId, file, defaultSchedule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign', 'bulk-jobs'] }),
  })
}

export function useBulkJobAction(action: 'confirm' | 'cancel' | 'retry') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => action === 'confirm' ? apiClient.confirmEsignBulkJob(jobId)
      : action === 'cancel' ? apiClient.cancelEsignBulkJob(jobId) : apiClient.retryEsignBulkJob(jobId),
    onSuccess: (job) => {
      queryClient.setQueryData(['esign', 'bulk-job', job.id], job)
      queryClient.invalidateQueries({ queryKey: ['esign', 'bulk-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['esign', 'envelopes'] })
    },
  })
}

export function usePowerForms() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'powerforms'], queryFn: () => apiClient.listEsignPowerForms(), enabled: !!user })
}

export function useCreatePowerForm() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (payload: EsignPowerFormCreateRequest) => apiClient.createEsignPowerForm(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign', 'powerforms'] }) })
}

export function usePowerFormAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'active' | 'paused' | 'revoked' | 'rotate' }) =>
      action === 'rotate' ? apiClient.rotateEsignPowerForm(id) : apiClient.setEsignPowerFormState(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign', 'powerforms'] }),
  })
}

export function useEsignReport(params: { start: string; end: string; source?: string; status?: string }) {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'report', params], queryFn: () => apiClient.getEsignReportSummary(params), enabled: !!user })
}
