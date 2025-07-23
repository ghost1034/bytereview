import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export interface DataType {
  id: string
  display_name: string
  description: string
  base_json_type: string
  json_format?: string
  display_order: number
}

/**
 * Shared hook for loading data types across the application
 * Provides caching and prevents duplicate API calls
 */
export function useDataTypes() {
  return useQuery<DataType[]>({
    queryKey: ['dataTypes'],
    queryFn: async () => {
      try {
        const response = await apiClient.getDataTypes()
        return response || []
      } catch (error) {
        console.error('Error loading data types:', error)
        // Return fallback data types if API fails
        return [
          { 
            id: 'text', 
            display_name: 'Text', 
            description: 'General text field',
            base_json_type: 'string',
            display_order: 1
          },
          { 
            id: 'number', 
            display_name: 'Number', 
            description: 'Numeric value',
            base_json_type: 'number',
            display_order: 2
          },
          { 
            id: 'currency', 
            display_name: 'Currency', 
            description: 'Monetary amount',
            base_json_type: 'number',
            display_order: 3
          },
          { 
            id: 'date', 
            display_name: 'Date', 
            description: 'Date value',
            base_json_type: 'string',
            json_format: 'date',
            display_order: 4
          },
          { 
            id: 'boolean', 
            display_name: 'Yes/No', 
            description: 'True/false value',
            base_json_type: 'boolean',
            display_order: 5
          }
        ]
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data types don't change often
    cacheTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    retry: 2, // Retry failed requests twice
  })
}