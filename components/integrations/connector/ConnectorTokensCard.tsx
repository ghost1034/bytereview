'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useConnectorTokens,
  useCreateConnectorToken,
  useRevokeConnectorToken,
} from '@/hooks/useConnector'

/**
 * Claw agent access tokens (``cpaa_conn_…``). Claw containers normally get one
 * automatically during activation; this card exists for visibility, manual
 * setups, and revocation. The full token value is shown exactly once.
 */
export function ConnectorTokensCard() {
  const { data } = useConnectorTokens()
  const createToken = useCreateConnectorToken()
  const revokeToken = useRevokeConnectorToken()
  const [name, setName] = useState('')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const tokens = (data?.tokens || []).filter((t) => !t.revoked)

  const handleCreate = async () => {
    const result = await createToken.mutateAsync(name.trim() || undefined)
    setFreshToken(result.token)
    setName('')
  }

  const handleCopy = async () => {
    if (!freshToken) return
    await navigator.clipboard.writeText(freshToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">
        Claw agents use these tokens to reach your connected integrations. A token is
        issued automatically when a Claw container activates; revoke any token here to
        cut that agent&apos;s access instantly.
      </p>

      {freshToken && (
        <Alert>
          <KeyRound className="size-4" />
          <AlertDescription>
            <p className="mb-1 font-medium">Copy this token now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs">
                {freshToken}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-border">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  <code className="font-mono text-xs">{token.token_prefix}</code>
                  {token.name && <span className="ml-2 text-xs text-foreground-muted">{token.name}</span>}
                </p>
                <p className="text-xs text-foreground-subtle">
                  {token.last_used_at
                    ? `Last used ${new Date(token.last_used_at).toLocaleString()}`
                    : 'Never used'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {token.name?.startsWith('claw:') && <Badge variant="secondary">Claw</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revokeToken.mutate(token.id)}
                  disabled={revokeToken.isPending}
                  title="Revoke token"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (optional)"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={handleCreate} disabled={createToken.isPending}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          New token
        </Button>
      </div>
    </div>
  )
}
