import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'

export interface ExportRefs {
  gdrive?: {
    csv?: { external_id?: string; status?: string }
    xlsx?: { external_id?: string; status?: string }
  }
}

export function useExportRefs(jobId?: string, runId?: string) {
  const [data, setData] = useState<ExportRefs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchRefs() {
      if (!jobId) return
      try {
        setLoading(true)
        setError(null)
        let effectiveRunId = runId
        if (!effectiveRunId) {
          // derive latest run id
          const runs = await apiClient.getJobRuns(jobId)
          effectiveRunId = runs.latest_run_id || runs.runs?.[0]?.id
        }
        if (!effectiveRunId) {
          if (!cancelled) {
            setData(null)
            setLoading(false)
          }
          return
        }
        const refs = await apiClient.getJobRunExportRefs(jobId, effectiveRunId)
        if (!cancelled) setData(refs)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load export refs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRefs()
    return () => { cancelled = true }
  }, [jobId, runId])

  const csvId = data?.gdrive?.csv?.external_id
  const xlsxId = data?.gdrive?.xlsx?.external_id

  const driveUrl = (id?: string) => id ? `https://drive.google.com/file/d/${id}/view` : undefined

  return {
    data,
    loading,
    error,
    csvId,
    xlsxId,
    csvUrl: driveUrl(csvId),
    xlsxUrl: driveUrl(xlsxId),
  }
}
