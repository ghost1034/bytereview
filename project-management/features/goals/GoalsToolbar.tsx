'use client'

/** Toolbar filters and view toggle for goals home. */
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Goal } from '../../types'
import type { GoalTab } from '../../lib/goals/goalSelectors'

export type GoalsViewMode = 'tree' | 'list'

type Props = {
  tab: GoalTab
  onTabChange: (tab: GoalTab) => void
  viewMode: GoalsViewMode
  onViewModeChange: (mode: GoalsViewMode) => void
  timeFilter: 'all' | 'quarter' | 'year'
  onTimeFilterChange: (v: 'all' | 'quarter' | 'year') => void
  ownerFilter: string
  onOwnerFilterChange: (v: string) => void
  statusFilter: Goal['status'] | 'all'
  onStatusFilterChange: (v: Goal['status'] | 'all') => void
  search: string
  onSearchChange: (v: string) => void
  owners: Array<{ id: string; name: string }>
  onCreate: () => void
}

const TAB_LABELS: Record<GoalTab, string> = {
  mine: 'My goals',
  followed: 'Followed',
  team: 'Team goals',
  company: 'Company goals',
  all: 'All goals',
}

/** Goals home header — tabs, filters, search, view toggle, create. */
export function GoalsToolbar({
  tab,
  onTabChange,
  viewMode,
  onViewModeChange,
  timeFilter,
  onTimeFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  owners,
  onCreate,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl">Goals & OKRs</h1>
        <Button className="tl-btn-primary border-0" size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-4 w-4" /> Create goal
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => onTabChange(v as GoalTab)}>
        <TabsList className="h-auto flex-wrap">
          {(Object.keys(TAB_LABELS) as GoalTab[]).map((key) => (
            <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
              {TAB_LABELS[key]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <Input
            className="tl-input pl-8"
            placeholder="Search goals…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <Select value={timeFilter} onValueChange={(v) => onTimeFilterChange(v as typeof timeFilter)}>
          <SelectTrigger className="w-[130px] tl-input"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All periods</SelectItem>
            <SelectItem value="quarter">This quarter</SelectItem>
            <SelectItem value="year">This year</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={onOwnerFilterChange}>
          <SelectTrigger className="w-[130px] tl-input"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All owners</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as Goal['status'] | 'all')}>
          <SelectTrigger className="w-[120px] tl-input"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="on_track">On track</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="off_track">Off track</SelectItem>
            <SelectItem value="achieved">Achieved</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            className="rounded-md p-1.5"
            style={{ background: viewMode === 'tree' ? 'var(--primary-soft)' : undefined }}
            title="Tree view"
            onClick={() => onViewModeChange('tree')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5"
            style={{ background: viewMode === 'list' ? 'var(--primary-soft)' : undefined }}
            title="List view"
            onClick={() => onViewModeChange('list')}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
