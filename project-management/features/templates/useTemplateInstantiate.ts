'use client'

/**
 * Hook wrapping template instantiation with loading state and navigation.
 */
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { instantiateTemplate } from '../../lib/templates/instantiateTemplate'
import type { InstantiateTemplateInput, ProjectWithTemplateMeta } from '../../lib/templates/types'

export function useTemplateInstantiate(workspaceId: string) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const useTemplate = useCallback(
    async (templateId: string, input: Omit<InstantiateTemplateInput, 'workspaceId'>) => {
      setLoadingId(templateId)
      try {
        const result = await instantiateTemplate(templateId, { ...input, workspaceId })
        if (result?.project) {
          router.push(`/dashboard/project-management/w/${workspaceId}/projects/${result.project.id}`)
          return result
        }
        return null
      } finally {
        setLoadingId(null)
      }
    },
    [router, workspaceId]
  )

  return { useTemplate, loadingId, isLoading: loadingId != null }
}

export type { ProjectWithTemplateMeta }
