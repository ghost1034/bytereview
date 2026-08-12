'use client'

/** Chart builder step 2 — filters and metrics. */
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dateFieldsForSource, groupFieldsForSource, measureFieldsForSource } from '../../lib/reporting/groupFields'
import type { ChartBuilderDraft } from '../../lib/reporting/types'
import type { CustomField, Section, Tag, User } from '../../types'
import type { FilterClause } from '../../lib/query/types'
import { isFilterGroup, migrateLegacyFilters } from '../../lib/query/filterExpression'
import { FilterBuilderPopover } from '../query/FilterBuilderPopover'

type Props = {
  draft: ChartBuilderDraft
  onChange: (patch: Partial<ChartBuilderDraft>) => void
  customFields: CustomField[]
  members: User[]
  sections: Section[]
  tags: Tag[]
}

/** Filters, measure, date field, and granularity controls. */
export function ChartFiltersStep({ draft, onChange, customFields, members, sections, tags }: Props) {
  const groupFields = groupFieldsForSource(draft.source, customFields)
  const measureFields = measureFieldsForSource(draft.source, customFields)
  const dateFields = dateFieldsForSource(draft.source, customFields)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Filters</Label>
        <FilterBuilderPopover
          expression={migrateLegacyFilters(draft.filters as FilterClause[])}
          onChange={(expression) => onChange({ filters: expression.children.filter((node): node is FilterClause => !isFilterGroup(node)) })}
          customFields={customFields}
          members={members}
          sections={sections}
          tags={tags}
          trigger={
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {draft.filters.length ? `${draft.filters.length} filters` : 'Add filters'}
            </Button>
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Metric</Label>
          <Select value={draft.measure} onValueChange={(v) => onChange({ measure: v as ChartBuilderDraft['measure'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">
              <SelectItem value="count">Count</SelectItem>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="avg">Average</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {draft.measure !== 'count' ? (
          <div className="space-y-2">
            <Label>Measure field</Label>
            <Select value={draft.measureField ?? ''} onValueChange={(v) => onChange({ measureField: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                {measureFields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {(draft.type === 'line' || draft.type === 'burnup') && draft.source === 'tasks' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Date field</Label>
            <Select value={draft.dateField ?? 'completedAt'} onValueChange={(v) => onChange({ dateField: v, yAxis: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                {dateFields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Granularity</Label>
            <Select
              value={draft.granularity ?? 'week'}
              onValueChange={(v) => onChange({ granularity: v as ChartBuilderDraft['granularity'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Group by (X axis)</Label>
          <Select value={draft.xAxis ?? groupFields[0]?.id} onValueChange={(v) => onChange({ xAxis: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">
              {groupFields.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
