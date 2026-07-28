'use client'

/**
 * Timeline toolbar extras — baseline controls, jump to today, rail toggle.
 */
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Task } from '../../../types'
import { now } from '../../../lib/time'
import type { BaselineSnapshot } from './types'

type Props = {
  tasks: Task[]
  showBaseline: boolean
  hasBaseline: boolean
  onShowBaseline: (v: boolean) => void
  onSaveBaseline: (snap: BaselineSnapshot) => void
  onClearBaseline: () => void
  onJumpToday: () => void
  railCollapsed: boolean
  onRailCollapsed: (v: boolean) => void
}

export function TimelineToolbarExtras({
  tasks,
  showBaseline,
  hasBaseline,
  onShowBaseline,
  onSaveBaseline,
  onClearBaseline,
  onJumpToday,
  railCollapsed,
  onRailCollapsed,
}: Props) {
  const save = () => {
    const snap: BaselineSnapshot = {
      snappedAt: now(),
      tasks: Object.fromEntries(
        tasks
          .filter((t) => t.startOn || t.dueOn)
          .map((t) => [t.id, { startOn: t.startOn, dueOn: t.dueOn }])
      ),
    }
    onSaveBaseline(snap)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={onJumpToday}>
        Today
      </Button>
      <Button variant="outline" size="sm" onClick={save}>
        Save baseline
      </Button>
      {hasBaseline ? (
        <>
          <div className="flex items-center gap-2">
            <Switch id="show-bl" className="tl-switch" checked={showBaseline} onCheckedChange={onShowBaseline} />
            <Label htmlFor="show-bl" className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Show baseline
            </Label>
          </div>
          <Button variant="ghost" size="sm" onClick={onClearBaseline}>
            Clear baseline
          </Button>
        </>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => onRailCollapsed(!railCollapsed)}>
        {railCollapsed ? 'Show rail' : 'Hide rail'}
      </Button>
    </>
  )
}
