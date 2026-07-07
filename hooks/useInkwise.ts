'use client'

import { useEffect } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import {
  apiClient,
  InkwisePaginatedChatMessages,
  InkwisePaginatedDocuments,
  InkwiseDocumentFolderListResponse,
  InkwiseDocumentRevisionListResponse,
  InkwisePaginatedSources,
  InkwiseSource,
  InkwiseSourceIngestionListResponse,
  InkwisePaginatedTemplates,
  InkwiseSystemTemplate,
  InkwiseSystemTemplateCategory,
} from '@/lib/api'
import { INKWISE_SOURCE_POLL_INTERVAL_MS, isInkwiseSourceActiveStatus } from '@/lib/inkwise-source-status'

type InkwiseQueryOptions = {
  enabled?: boolean
  refetchInterval?: number | false | ((query: { state: { data?: unknown } }) => number | false | undefined)
  refetchOnWindowFocus?: boolean
}

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

export function useInkwiseDocumentFolders() {
  return useQuery<InkwiseDocumentFolderListResponse>({
    queryKey: ['inkwise', 'document-folders'],
    queryFn: () => apiClient.listInkwiseDocumentFolders(),
  })
}

export function useInkwiseDocumentRevisions(documentId: string) {
  return useQuery<InkwiseDocumentRevisionListResponse>({
    queryKey: ['inkwise', 'document-revisions', documentId],
    queryFn: () => apiClient.listInkwiseDocumentRevisions(documentId),
    enabled: Boolean(documentId),
  })
}

// The backend caps the sources listing at 100 items per page. Pages are
// fetched on demand (via fetchNextPage) and accumulated, so consumers render
// a single growing list with no cap on library size.
const INKWISE_SOURCES_PAGE_SIZE = 100

export type InkwiseSourcesResult = {
  items: InkwiseSource[]
  total: number
}

export function useInkwiseSources(options?: { enabled?: boolean; loadAll?: boolean }) {
  const query = useInfiniteQuery({
    queryKey: ['inkwise', 'sources'],
    queryFn: ({ pageParam }) => apiClient.listInkwiseSources({ page: pageParam, limit: INKWISE_SOURCES_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined),
    enabled: options?.enabled,
    refetchOnWindowFocus: true,
    refetchInterval: (activeQuery) => {
      const data = activeQuery.state.data as { pages?: InkwisePaginatedSources[] } | undefined
      const hasActive = data?.pages?.some((page) => page.items.some((source) => isInkwiseSourceActiveStatus(source.status)))
      return hasActive ? INKWISE_SOURCE_POLL_INTERVAL_MS : false
    },
    select: (data): InkwiseSourcesResult => ({
      items: data.pages.flatMap((page) => page.items),
      total: data.pages[data.pages.length - 1]?.total ?? 0,
    }),
  })

  // Search is filtered client-side, so while loadAll is set (e.g. a search is
  // active) we keep paging until the whole library is loaded; otherwise pages
  // load on demand as the consumer requests them.
  const loadAll = options?.loadAll ?? false
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query
  useEffect(() => {
    if (loadAll && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage()
    }
  }, [loadAll, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  return query
}

export function useInkwiseSourceIngestions(sourceId?: string, options?: InkwiseQueryOptions) {
  return useQuery<InkwiseSourceIngestionListResponse>({
    queryKey: ['inkwise', 'source-ingestions', sourceId ?? 'all'],
    queryFn: () => apiClient.listInkwiseSourceIngestions(sourceId),
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  })
}

export function useInkwiseDocumentSources(documentId: string, options?: InkwiseQueryOptions) {
  return useQuery({
    queryKey: ['inkwise', 'document-sources', documentId],
    queryFn: () => apiClient.getInkwiseDocumentSources(documentId),
    enabled: (options?.enabled ?? true) && Boolean(documentId),
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
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

export function useInkwiseChatThreads(documentId?: string, options?: InkwiseQueryOptions) {
  return useQuery({
    queryKey: ['inkwise', 'chat-threads', documentId ?? 'all'],
    queryFn: () => apiClient.listInkwiseChatThreads(documentId),
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  })
}

export function useInkwiseChatMessages(threadId?: string, page = 1, limit = 100) {
  return useQuery<InkwisePaginatedChatMessages>({
    queryKey: ['inkwise', 'chat-messages', threadId ?? 'none', page, limit],
    queryFn: () => apiClient.listInkwiseChatMessages(threadId as string, { page, limit }),
    enabled: Boolean(threadId),
  })
}
