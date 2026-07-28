'use client'

/** Toolbar toggle for showing/hiding completed tasks in a view. */
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolvesShowCompleted, type ViewQuery } from '../../lib/query/applyQuery'

type Props = {
  query: ViewQuery
  onChange: (query: ViewQuery) => void
}

export function ShowCompletedToggle({ query, onChange }: Props) {
  const showCompleted = resolvesShowCompleted(query)
  const hasIncompleteFilter = query.filters.some(
    (f) => f.field === 'completed' && f.op === 'eq' && f.value === false
  )

  const toggle = () => {
    const nextShow = !showCompleted
    let filters = query.filters
    if (nextShow) {
      filters = filters.filter(
        (f) => !(f.field === 'completed' && f.op === 'eq' && f.value === false)
      )
    }
    onChange({
      ...query,
      showCompleted: nextShow,
      hiddenCompleted: !nextShow,
      filters,
    })
  }

  return (
    <Button
      type="button"
      variant={showCompleted ? 'outline' : 'default'}
      size="sm"
      className="gap-1.5"
      onClick={toggle}
      title={
        hasIncompleteFilter && !showCompleted
          ? 'Completed tasks are hidden by filters. Turn this on or remove Incomplete only.'
          : showCompleted
            ? 'Hide completed tasks from this view'
            : 'Show completed tasks in this view'
      }
    >
      <CheckCircle2 className="h-4 w-4" />
      {showCompleted ? 'Hide completed' : 'Show completed'}
    </Button>
  )
}
