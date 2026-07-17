/**
 * React Query hooks for the OpenConnector integration broker
 * (catalog browsing, connection management, Claw MCP tokens).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import type {
  CreateConnectorConnectionRequest,
  CreateConnectorConnectionResponse,
} from '@/lib/connector-types'

export function useConnectorCatalog(params: {
  search?: string
  category?: string
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: ['connector-catalog', params.search ?? '', params.category ?? '', params.page ?? 1, params.pageSize ?? 48],
    queryFn: () => apiClient.getConnectorCatalog(params),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export function useConnectorProvider(service: string | null) {
  return useQuery({
    queryKey: ['connector-provider', service],
    queryFn: () => apiClient.getConnectorProvider(service!),
    enabled: !!service,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export function useConnectorConnections() {
  return useQuery({
    queryKey: ['connector-connections'],
    queryFn: () => apiClient.listConnectorConnections(),
    staleTime: 60 * 1000,
    retry: 1,
  })
}

export function useCreateConnectorConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateConnectorConnectionRequest): Promise<CreateConnectorConnectionResponse> =>
      apiClient.createConnectorConnection(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connector-connections'] })
      queryClient.invalidateQueries({ queryKey: ['connector-catalog'] })
      if (!data.authorization_url) {
        toast({ title: 'Connected', description: 'Integration connected successfully.' })
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Connection failed',
        description: error?.message || 'Could not connect this integration.',
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteConnectorConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (connectionId: string) => apiClient.deleteConnectorConnection(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-connections'] })
      queryClient.invalidateQueries({ queryKey: ['connector-catalog'] })
      toast({ title: 'Disconnected', description: 'Integration removed.' })
    },
    onError: (error: any) => {
      toast({
        title: 'Disconnect failed',
        description: error?.message || 'Could not remove this integration.',
        variant: 'destructive',
      })
    },
  })
}

export function useTestConnectorConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (connectionId: string) => apiClient.testConnectorConnection(connectionId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connector-connections'] })
      toast(
        data.connection.status === 'active'
          ? { title: 'Connection OK', description: 'The credential is valid.' }
          : {
              title: 'Connection problem',
              description: data.connection.error_message || 'Reconnect this provider.',
              variant: 'destructive',
            },
      )
    },
  })
}

export function useConnectorTokens() {
  return useQuery({
    queryKey: ['connector-tokens'],
    queryFn: () => apiClient.listConnectorTokens(),
    staleTime: 60 * 1000,
    retry: 1,
  })
}

export function useCreateConnectorToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name?: string) => apiClient.createConnectorToken(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connector-tokens'] }),
    onError: (error: any) => {
      toast({
        title: 'Token creation failed',
        description: error?.message || 'Could not create the token.',
        variant: 'destructive',
      })
    },
  })
}

export function useRevokeConnectorToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tokenId: string) => apiClient.revokeConnectorToken(tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-tokens'] })
      toast({ title: 'Token revoked' })
    },
  })
}
