'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plug, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconTile } from '@/components/ui/icon-tile'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConnectorCatalog } from '@/hooks/useConnector'
import type { ConnectorCatalogProvider } from '@/lib/connector-types'
import { ConnectDialog } from './ConnectDialog'
import { ProviderStatusBadge } from './ProviderStatusBadge'

const ALL_CATEGORIES = '__all__'
const PAGE_SIZE = 48

function ProviderCard({
  provider,
  onConnect,
}: {
  provider: ConnectorCatalogProvider
  onConnect: (service: string) => void
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile icon={Plug} size="lg" tone="neutral" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {provider.display_name}
              </p>
              <p className="truncate text-xs text-foreground-muted">
                {provider.categories.slice(0, 2).join(' · ') || provider.service}
              </p>
            </div>
          </div>
          <ProviderStatusBadge provider={provider} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-xs text-foreground-subtle">
            {provider.action_count} actions
          </span>
          <Button
            size="sm"
            variant={provider.connected ? 'outline' : 'default'}
            disabled={!provider.available && !provider.connected}
            onClick={() => onConnect(provider.service)}
          >
            {provider.connected ? 'Add another' : provider.available ? 'Connect' : 'Unavailable'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Searchable, paginated browser over the full OpenConnector provider catalog
 * (1,000+ services). Connected providers sort first, then providers that are
 * connectable today.
 */
export function ProviderCatalog() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>(ALL_CATEGORIES)
  const [page, setPage] = useState(1)
  const [connectService, setConnectService] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, isLoading, isFetching, error } = useConnectorCatalog({
    search: search || undefined,
    category: category === ALL_CATEGORIES ? undefined : category,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search 1,000+ integrations (QuickBooks, Slack, Notion…)"
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {(data?.categories || []).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-foreground-muted">
          Integrations are temporarily unavailable. Try again shortly.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-foreground-muted">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          Loading integration catalog…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.providers || []).map((provider) => (
              <ProviderCard
                key={provider.service}
                provider={provider}
                onConnect={setConnectService}
              />
            ))}
          </div>

          {data && data.providers.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
              No integrations match your search.
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground-muted">
              {data
                ? `${data.total} integrations${isFetching ? ' · updating…' : ''}`
                : ''}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Previous
                </Button>
                <span className="text-xs text-foreground-muted">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ConnectDialog service={connectService} onOpenChange={(open) => !open && setConnectService(null)} />
    </div>
  )
}
