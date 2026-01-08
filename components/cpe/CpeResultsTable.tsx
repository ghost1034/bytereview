'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient, JobResultsResponse } from '@/lib/api'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface CpeResultsTableProps {
  jobId: string
  runId?: string
}

export function CpeResultsTable({ jobId, runId }: CpeResultsTableProps) {
  const { data, isLoading, error } = useQuery<JobResultsResponse>({
    queryKey: ['job-results', jobId, runId],
    queryFn: () => apiClient.getJobResults(jobId, { runId, limit: 1000 }),
    enabled: !!jobId,
  })

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        Error loading results: {error.message}
      </div>
    )
  }

  if (!data || data.results.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No results yet. Upload CPE certificates and click Start to begin extraction.
      </div>
    )
  }

  // Flatten results into rows with unified columns
  // Ignore result_set_index - show all results as one continuous table
  const allRows: Record<string, any>[] = []
  const columnSet = new Set<string>()

  // Add "Source File Path(s)" as first column
  columnSet.add('Source File Path(s)')

  for (const result of data.results) {
    const extractedData = result.extracted_data
    if (!extractedData) continue

    // Handle both array and single object results
    const columns = extractedData.columns || []
    const rows = extractedData.results || []

    // Add all columns to the set
    columns.forEach((col: string) => columnSet.add(col))

    // Process rows
    for (const row of rows) {
      const rowData: Record<string, any> = {
        'Source File Path(s)': result.source_files?.join(', ') || ''
      }

      // Map column values
      columns.forEach((col: string, idx: number) => {
        rowData[col] = row[idx] ?? ''
      })

      allRows.push(rowData)
    }
  }

  const columns = Array.from(columnSet)

  if (allRows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No data extracted yet. Results will appear here once processing completes.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="min-w-max">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap bg-gray-50 font-semibold">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {allRows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col} className="whitespace-nowrap">
                    {row[col] ?? ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
