'use client'

import { useQuery } from '@tanstack/react-query'

import {
  apiClient,
  InkwisePaginatedChatMessages,
  InkwisePaginatedDocuments,
  InkwiseDocumentRevisionListResponse,
  InkwisePaginatedSources,
  InkwiseSourceIngestionListResponse,
  InkwisePaginatedTemplates,
  InkwiseSystemTemplate,
  InkwiseSystemTemplateCategory,
} from '@/lib/api'

export function useInkwiseDocuments(page = 1, limit = 50) {
  return useQuery<InkwisePaginatedDocuments>({
    queryKey: ['inkwise', 'documents', page, limit],
    queryFn: () => apiClient.listInkwiseDocuments({ page, limit }),
  })
}

export function useInkwiseDocument(documentId: string) {
  return useQuery({
    queryKey: ['inkwise', 'document', documentId],
    queryFn: () => apiClient.getInkwiseDocument(documentId),
    enabled: Boolean(documentId),
  })
}

export function useInkwiseDocumentRevisions(documentId: string) {
  return useQuery<InkwiseDocumentRevisionListResponse>({
    queryKey: ['inkwise', 'document-revisions', documentId],
    queryFn: () => apiClient.listInkwiseDocumentRevisions(documentId),
    enabled: Boolean(documentId),
  })
}

export function useInkwiseSources(page = 1, limit = 50) {
  return useQuery<InkwisePaginatedSources>({
    queryKey: ['inkwise', 'sources', page, limit],
    queryFn: () => apiClient.listInkwiseSources({ page, limit }),
  })
}

export function useInkwiseSourceIngestions(sourceId?: string) {
  return useQuery<InkwiseSourceIngestionListResponse>({
    queryKey: ['inkwise', 'source-ingestions', sourceId ?? 'all'],
    queryFn: () => apiClient.listInkwiseSourceIngestions(sourceId),
  })
}

export function useInkwiseDocumentSources(documentId: string) {
  return useQuery({
    queryKey: ['inkwise', 'document-sources', documentId],
    queryFn: () => apiClient.getInkwiseDocumentSources(documentId),
    enabled: Boolean(documentId),
  })
}

export function useInkwiseTemplates(page = 1, limit = 50) {
  return useQuery<InkwisePaginatedTemplates>({
    queryKey: ['inkwise', 'templates', page, limit],
    queryFn: () => apiClient.listInkwiseTemplates({ page, limit }),
  })
}

export function useInkwiseTemplate(templateId: string) {
  return useQuery({
    queryKey: ['inkwise', 'template', templateId],
    queryFn: () => apiClient.getInkwiseTemplate(templateId),
    enabled: Boolean(templateId),
  })
}

export function useInkwiseSystemTemplateCategories() {
  return useQuery<{ items: InkwiseSystemTemplateCategory[] }>({
    queryKey: ['inkwise', 'system-template-categories'],
    queryFn: () => apiClient.listInkwiseSystemTemplateCategories(),
  })
}

export function useInkwiseSystemTemplates(categoryId?: number) {
  return useQuery<{ items: InkwiseSystemTemplate[] }>({
    queryKey: ['inkwise', 'system-templates', categoryId ?? 'all'],
    queryFn: () => apiClient.listInkwiseSystemTemplates(categoryId),
  })
}

export function useInkwiseSystemTemplate(systemTemplateId: string) {
  return useQuery({
    queryKey: ['inkwise', 'system-template', systemTemplateId],
    queryFn: () => apiClient.getInkwiseSystemTemplate(systemTemplateId),
    enabled: Boolean(systemTemplateId),
  })
}

export function useInkwiseChatThreads(documentId?: string) {
  return useQuery({
    queryKey: ['inkwise', 'chat-threads', documentId ?? 'all'],
    queryFn: () => apiClient.listInkwiseChatThreads(documentId),
  })
}

export function useInkwiseChatMessages(threadId?: string, page = 1, limit = 100) {
  return useQuery<InkwisePaginatedChatMessages>({
    queryKey: ['inkwise', 'chat-messages', threadId ?? 'none', page, limit],
    queryFn: () => apiClient.listInkwiseChatMessages(threadId as string, { page, limit }),
    enabled: Boolean(threadId),
  })
}
