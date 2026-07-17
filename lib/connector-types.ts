/**
 * Types for the OpenConnector integration broker (/api/connector/*).
 * Mirrors backend/models/connector.py.
 */

export interface ConnectorCatalogProvider {
  service: string
  display_name: string
  categories: string[]
  auth_types: string[]
  action_count: number
  available: boolean
  oauth_configured: boolean
  connected: boolean
}

export interface ConnectorCatalogResponse {
  success: boolean
  providers: ConnectorCatalogProvider[]
  total: number
  page: number
  page_size: number
  categories: string[]
}

export interface ConnectorCredentialField {
  key: string
  label?: string | null
  placeholder?: string | null
  description?: string | null
  required: boolean
  secret: boolean
}

export interface ConnectorActionSummary {
  id: string
  name: string
  description?: string | null
}

export interface ConnectorProviderDetail {
  success: boolean
  service: string
  display_name: string
  categories: string[]
  auth_types: string[]
  available: boolean
  oauth_configured: boolean
  connected: boolean
  api_key_fields: ConnectorCredentialField[]
  custom_credential_fields: ConnectorCredentialField[]
  actions: ConnectorActionSummary[]
  action_count: number
}

export interface ConnectorConnection {
  id: string
  service: string
  display_name?: string | null
  label?: string | null
  auth_type: string
  status: 'pending' | 'active' | 'error' | 'revoked'
  error_message?: string | null
  created_at: string
  last_used_at?: string | null
}

export interface ConnectorConnectionsResponse {
  success: boolean
  connections: ConnectorConnection[]
}

export interface CreateConnectorConnectionRequest {
  service: string
  auth_type: string
  label?: string
  values?: Record<string, string>
}

export interface CreateConnectorConnectionResponse {
  success: boolean
  connection: ConnectorConnection
  authorization_url?: string | null
}

export interface ConnectorConnectionStatusResponse {
  success: boolean
  connection: ConnectorConnection
}

export interface ConnectorExecuteResponse {
  success: boolean
  message?: string | null
  data?: unknown
  meta?: Record<string, unknown> | null
}

export interface ConnectorTokenInfo {
  id: string
  token_prefix: string
  name?: string | null
  created_at: string
  last_used_at?: string | null
  revoked: boolean
}

export interface ConnectorTokensResponse {
  success: boolean
  tokens: ConnectorTokenInfo[]
}

export interface CreateConnectorTokenResponse {
  success: boolean
  token: string
  token_info: ConnectorTokenInfo
}
