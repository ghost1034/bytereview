/**
 * React hooks for the E-Signature module.
 * Query keys are namespaced ['esign', ...]; active envelopes poll (no SSE in v1).
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import type {
  EsignEnvelopeResponse,
  EsignEnvelopeUpdateRequest,
  EsignFieldInput,
  EsignRecipientInput,
  EsignSubmitRequest,
  EsignTemplateRoleInput,
  EsignTemplateUpdateRequest,
} from '@/lib/api'

const TERMINAL_STATUSES = new Set(['completed', 'declined', 'voided', 'expired'])

export function useEnvelopes(limit = 25, offset = 0, status?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'envelopes', limit, offset, status ?? 'all'],
    queryFn: () => apiClient.listEsignEnvelopes(limit, offset, status),
    enabled: !!user,
    refetchInterval: (query) => {
      const envelopes = query.state.data?.envelopes ?? []
      const hasActive = envelopes.some((e) => !TERMINAL_STATUSES.has(e.status) && e.status !== 'draft')
      return hasActive ? 20000 : false
    },
  })
}

export function useEnvelope(envelopeId: string | undefined) {
  const { user } = useAuth()
  return useQuery<EsignEnvelopeResponse>({
    queryKey: ['esign', 'envelope', envelopeId],
    queryFn: () => apiClient.getEsignEnvelope(envelopeId!),
    enabled: !!user && !!envelopeId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && !TERMINAL_STATUSES.has(status) && status !== 'draft' ? 15000 : false
    },
  })
}

export function useEnvelopeAudit(envelopeId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'audit', envelopeId],
    queryFn: () => apiClient.getEsignAuditTrail(envelopeId!),
    enabled: !!user && !!envelopeId,
  })
}

export function useEsignInbox() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'inbox'],
    queryFn: () => apiClient.getEsignInbox(),
    enabled: !!user,
    refetchInterval: 30000,
  })
}

export function useEsignTemplates() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'templates'],
    queryFn: () => apiClient.listEsignTemplates(),
    enabled: !!user,
  })
}

export function useEsignTemplate(templateId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'template', templateId],
    queryFn: () => apiClient.getEsignTemplate(templateId!),
    enabled: !!user && !!templateId,
  })
}

function useInvalidateEnvelope() {
  const queryClient = useQueryClient()
  return (envelopeId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['esign', 'envelopes'] })
    queryClient.invalidateQueries({ queryKey: ['esign', 'inbox'] })
    if (envelopeId) {
      queryClient.invalidateQueries({ queryKey: ['esign', 'envelope', envelopeId] })
      queryClient.invalidateQueries({ queryKey: ['esign', 'audit', envelopeId] })
    }
  }
}

export function useCreateEnvelope() {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (params: Parameters<typeof apiClient.createEsignEnvelope>[0]) =>
      apiClient.createEsignEnvelope(params),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateEnvelope(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (payload: EsignEnvelopeUpdateRequest) =>
      apiClient.updateEsignEnvelope(envelopeId, payload),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useAddDocuments(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (files: File[]) => apiClient.addEsignDocuments(envelopeId, files),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useDeleteDocument(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (documentId: string) => apiClient.deleteEsignDocument(envelopeId, documentId),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useReplaceRecipients(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: ({ recipients, templateId }: { recipients: EsignRecipientInput[]; templateId?: string }) =>
      apiClient.replaceEsignRecipients(envelopeId, recipients, templateId),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useReplaceFields(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (fields: EsignFieldInput[]) => apiClient.replaceEsignFields(envelopeId, fields),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useSendEnvelope(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: () => apiClient.sendEsignEnvelope(envelopeId),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useVoidEnvelope(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (reason: string) => apiClient.voidEsignEnvelope(envelopeId, reason),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useRemindEnvelope(envelopeId: string) {
  return useMutation({
    mutationFn: () => apiClient.remindEsignEnvelope(envelopeId),
  })
}

export function useSaveAsTemplate(envelopeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      apiClient.saveEsignEnvelopeAsTemplate(envelopeId, name, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign', 'templates'] }),
  })
}

export function useSigningSession(envelopeId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'signing-session', envelopeId],
    queryFn: () => apiClient.getEsignSigningSession(envelopeId!),
    enabled: !!user && !!envelopeId,
    retry: false,
  })
}

export function useRecordConsent(envelopeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.recordEsignConsent(envelopeId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['esign', 'signing-session', envelopeId] }),
  })
}

export function useSubmitSignature(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (payload: EsignSubmitRequest) => apiClient.submitEsignSignature(envelopeId, payload),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useDeclineEnvelope(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (reason: string) => apiClient.declineEsignEnvelope(envelopeId, reason),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useVerifyDocument() {
  return useMutation({
    mutationFn: (params: { envelopeId?: string; file?: File }) => apiClient.verifyEsignDocument(params),
  })
}

export function useCreateEsignTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      name: string
      description?: string
      title?: string
      message?: string
      signingType?: string
      recipientRoles?: EsignTemplateRoleInput[]
      files: File[]
    }) => apiClient.createEsignTemplate(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign', 'templates'] }),
  })
}

export function useUpdateEsignTemplate(templateId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: EsignTemplateUpdateRequest) =>
      apiClient.updateEsignTemplate(templateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esign', 'templates'] })
      queryClient.invalidateQueries({ queryKey: ['esign', 'template', templateId] })
    },
  })
}

export function useDeleteEsignTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => apiClient.deleteEsignTemplate(templateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign', 'templates'] }),
  })
}
