'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Search } from 'lucide-react'

import { apiClient } from '@/lib/api'
import type { AnalyticsClient } from '@/lib/analytics/types'

export type ClientSelection =
  | AnalyticsClient
  | { id: 'general'; name: 'General Research'; industry: 'N/A' }

interface ClientSelectorProps {
  onSelectClient: (client: ClientSelection) => void
  title?: string
  description?: string
  allowGeneral?: boolean
}

export function ClientSelector({
  onSelectClient,
  title = 'Select Client',
  description = 'Choose a client to start the workflow.',
  allowGeneral = false,
}: ClientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'clients'],
    queryFn: () => apiClient.listAnalyticsClients(),
  })

  const clients: AnalyticsClient[] = data?.clients ?? []

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? '').toLowerCase().includes(q),
    )
  }, [clients, searchQuery])

  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-surface-muted p-8">
          <div className="mb-2 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Building2 size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{title}</h2>
              <p className="text-foreground-muted">{description}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" size={20} />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted py-3 pl-10 pr-4 transition-all focus:bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-foreground-muted">Loading clients...</div>
          ) : (
            <div className="grid gap-3">
              {allowGeneral && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectClient({ id: 'general', name: 'General Research', industry: 'N/A' })
                  }
                  className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-blue-500 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted font-bold text-foreground-muted">
                      G
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground transition-colors group-hover:text-blue-600">
                        General Research
                      </h3>
                      <p className="text-sm text-foreground-muted">Non-client specific research</p>
                    </div>
                  </div>
                  <ArrowRight className="text-foreground-subtle transition-colors group-hover:text-blue-600" size={20} />
                </button>
              )}
              {filteredClients.length > 0
                ? filteredClients.map((client) => (
                    <button
                      type="button"
                      key={client.id}
                      onClick={() => onSelectClient(client)}
                      className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-blue-500 hover:shadow-md"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted font-bold text-foreground-muted">
                          {client.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground transition-colors group-hover:text-blue-600">
                            {client.name}
                          </h3>
                          <p className="text-sm text-foreground-muted">{client.industry ?? '—'}</p>
                        </div>
                      </div>
                      <ArrowRight className="text-foreground-subtle transition-colors group-hover:text-blue-600" size={20} />
                    </button>
                  ))
                : !allowGeneral && (
                    <div className="py-12 text-center text-foreground-muted">
                      No clients found. Please add a client in the Clients module first.
                    </div>
                  )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClientSelector
