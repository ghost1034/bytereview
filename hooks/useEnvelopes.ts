/**
 * React hooks for the E-Signature module.
 * Query keys are namespaced ['esign', ...]; active envelopes poll (no SSE in v1).
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import type { components } from '@/lib/api-types'
import type {
  EsignEnvelopeResponse,
  EsignEnvelopeUpdateRequest,
  EsignFieldInput,
  EsignRecipientInput,
  EsignScheduleRequest,
  EsignSubmitRequest,
  EsignTemplateRoleInput,
  EsignTemplateUpdateRequest,
} from '@/lib/api'

const TERMINAL_STATUSES = new Set(['completed', 'declined', 'voided', 'expired'])

export interface EsignEnvelopeListParams {
  limit?: number
  offset?: number
  status?: string
  sourceType?: 'manual' | 'bulk' | 'powerform'
  sourceId?: string
  templateVersionId?: string
  q?: string
  sortBy?: 'updated_at' | 'created_at' | 'sent_at' | 'completed_at' | 'title'
  sortDir?: 'asc' | 'desc'
  scope?: 'mine' | 'shared' | 'firm'
  ownerUserId?: string
}

export function useEsignContext() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'context'], queryFn: () => apiClient.getEsignContext(), enabled: !!user })
}

export function useEsignAdminOverview() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'admin', 'overview'], queryFn: () => apiClient.getEsignAdminOverview(), enabled: !!user, retry: false })
}

export function useEsignAdminSettings() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'admin', 'settings'], queryFn: () => apiClient.getEsignAdminSettings(), enabled: !!user, retry: false })
}

export function useUpdateEsignAdminSettings() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (payload: Record<string, any>) => apiClient.updateEsignAdminSettings(payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['esign', 'admin'] }); queryClient.invalidateQueries({ queryKey: ['esign', 'context'] }) } })
}

export function useEsignPermissionProfiles() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'admin', 'profiles'], queryFn: () => apiClient.listEsignPermissionProfiles(), enabled: !!user, retry: false })
}

export function useEsignBrands() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'admin', 'brands'], queryFn: () => apiClient.listEsignBrands(), enabled: !!user, retry: false })
}

export function useEsignFirmWebhooks() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'admin', 'webhooks'], queryFn: () => apiClient.listEsignFirmWebhooks(), enabled: !!user, retry: false })
}

export function useEsignWebhookDeliveries(status?: string) {
  const { user } = useAuth()
  return useQuery({ queryKey: ['esign', 'admin', 'deliveries', status], queryFn: () => apiClient.listEsignWebhookDeliveries(status), enabled: !!user, retry: false })
}

export function useEnvelopes(params: EsignEnvelopeListParams = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'envelopes', params],
    queryFn: () => apiClient.listEsignEnvelopes(params),
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

export function useEsignInbox(params: { q?: string; state?: 'pending' | 'completed' } = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'inbox', params],
    queryFn: () => apiClient.getEsignInbox(params),
    enabled: !!user,
    refetchInterval: 30000,
  })
}

export function useEsignTemplates(includeArchived = false) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['esign', 'templates', { includeArchived }],
    queryFn: () => apiClient.listEsignTemplates(includeArchived),
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

export function useDeleteEnvelope() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (envelopeId: string) => apiClient.deleteEsignEnvelope(envelopeId),
    onSuccess: (_data, envelopeId) => {
      queryClient.invalidateQueries({ queryKey: ['esign', 'envelopes'] })
      queryClient.removeQueries({ queryKey: ['esign', 'envelope', envelopeId] })
      queryClient.removeQueries({ queryKey: ['esign', 'audit', envelopeId] })
    },
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

export function useReorderDocuments(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (documentIds: string[]) => apiClient.reorderEsignDocuments(envelopeId, documentIds),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useReplaceRecipients(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: ({ recipients, templateId, expectedRevision }: { recipients: EsignRecipientInput[]; templateId?: string; expectedRevision?: number }) =>
      apiClient.replaceEsignRecipients(envelopeId, recipients, templateId, expectedRevision),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useReplaceFields(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: ({ fields, expectedRevision }: { fields: EsignFieldInput[]; expectedRevision?: number }) => apiClient.replaceEsignFields(envelopeId, fields, expectedRevision),
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

export function useScheduleEnvelope(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({
    mutationFn: (payload: EsignScheduleRequest) => apiClient.scheduleEsignEnvelope(envelopeId, payload),
    onSuccess: () => invalidate(envelopeId),
  })
}

export function useUnscheduleEnvelope(envelopeId: string) {
  const invalidate = useInvalidateEnvelope()
  return useMutation({ mutationFn: () => apiClient.unscheduleEsignEnvelope(envelopeId), onSuccess: () => invalidate(envelopeId) })
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
    mutationFn: (expectedRoutingVersion: number) => apiClient.recordEsignConsent(envelopeId, expectedRoutingVersion),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['esign', 'signing-session', envelopeId] }),
  })
}

export function useSaveSigningProgress(envelopeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldValues, expectedRoutingVersion, marks }: { fieldValues: { field_id: string; value?: string | null }[]; expectedRoutingVersion: number; marks?: components['schemas']['EsignMarkBundle'] }) =>
      apiClient.saveEsignSigningProgress(envelopeId, fieldValues, expectedRoutingVersion, marks),
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
    mutationFn: ({ reason, expectedRoutingVersion }: { reason: string; expectedRoutingVersion: number }) =>
      apiClient.declineEsignEnvelope(envelopeId, reason, expectedRoutingVersion),
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
