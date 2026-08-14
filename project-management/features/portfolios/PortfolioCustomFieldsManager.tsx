'use client'

/** PortfolioCustomFieldsManager — attach portfolio-level custom fields. */
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setPortfolioCustomFieldIds, setPortfolioGoals } from '../../lib/portfolios/portfolioActions'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useGoalsStore } from '../../stores/entities'
import { filterActiveFields } from '../../lib/customFields/fieldConfig'
import { fieldTypeLabel } from '../../lib/customFields/fieldTypes'
import { FieldEditorDialog } from '../custom-fields/FieldEditorDialog'
import { FieldTypeIcon } from '../custom-fields/FieldTypeIcon'

type Props = { portfolio: EnrichedPortfolio }

export function PortfolioCustomFieldsManager({ portfolio }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const library = useCustomFieldsStore((s) => s.list().filter((f) => f.workspaceId === portfolio.workspaceId))
  const goals = useGoalsStore((s) => s.list().filter((g) => g.workspaceId === portfolio.workspaceId))
  const attached = useMemo(
    () => portfolio.customFieldIds.map((id) => library.find((f) => f.id === id)).filter(Boolean),
    [library, portfolio.customFieldIds]
  )
  const [librarySearch, setLibrarySearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)

  const available = useMemo(() => {
    const q = librarySearch.trim().toLowerCase()
    const attachedSet = new Set(portfolio.customFieldIds)
    return filterActiveFields(library).filter(
      (f) =>
        f.isGlobal &&
        !attachedSet.has(f.id) &&
        (!q || f.name.toLowerCase().includes(q))
    )
  }, [library, librarySearch, portfolio.customFieldIds])

  const addField = async (fieldId: string) => {
    await setPortfolioCustomFieldIds(portfolio.id, [...portfolio.customFieldIds, fieldId])
  }

  const removeField = async (fieldId: string) => {
    await setPortfolioCustomFieldIds(
      portfolio.id,
      portfolio.customFieldIds.filter((id) => id !== fieldId)
    )
  }

  const toggleGoal = async (goalId: string) => {
    const next = portfolio.goalIds.includes(goalId)
      ? portfolio.goalIds.filter((id) => id !== goalId)
      : [...portfolio.goalIds, goalId]
    await setPortfolioGoals(portfolio.id, next)
  }

  if (!currentUserId) return null

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-sans text-lg">Portfolio fields</h3>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          These fields appear as columns on the Projects tab (values are stored per project in portfolio context).
        </p>
        <div className="mt-3 flex gap-2">
          <Input className="tl-input max-w-xs" placeholder="Search library…" value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} />
          <Button size="sm" onClick={() => setEditorOpen(true)}><Plus className="mr-1 h-4 w-4" />Create field</Button>
        </div>
        <ul className="mt-4 space-y-2">
          {attached.map((f) => f && (
            <li key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
              <span className="flex items-center gap-2 text-sm">
                <FieldTypeIcon type={f.type} />
                {f.name}
                <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{fieldTypeLabel(f.type)}</span>
              </span>
              <button type="button" onClick={() => void removeField(f.id)} aria-label={`Remove ${f.name}`}>
                <X className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
              </button>
            </li>
          ))}
          {!attached.length && <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No portfolio fields yet.</p>}
        </ul>
        {available.length > 0 && (
          <ul className="mt-3 space-y-1">
            {available.slice(0, 8).map((f) => (
              <li key={f.id}>
                <button type="button" className="text-sm underline" style={{ color: 'hsl(var(--primary))' }} onClick={() => void addField(f.id)}>
                  + Add {f.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="font-sans text-lg">Linked goals</h3>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Goals supported by this portfolio appear on the Progress tab.</p>
        <ul className="mt-3 space-y-1">
          {goals.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={portfolio.goalIds.includes(g.id)} onChange={() => void toggleGoal(g.id)} />
              {g.name}
            </label>
          ))}
          {!goals.length && <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No goals in workspace.</p>}
        </ul>
      </div>

      <FieldEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        workspaceId={portfolio.workspaceId}
        userId={currentUserId}
        defaultGlobal
        onSaved={(field) => void addField(field.id)}
      />
    </div>
  )
}
