'use client'

/** Toolbar filters for workload scope, range, scale, and export. */
import { Download, Settings2 } from 'lucide-react'
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
import type { TimeScale, WorkloadPreset, WorkloadScopeMode } from '../../lib/workload'
import type { ISODate } from '../../types'
import type { CustomField, Project, Team } from '../../types'

export type WorkloadGroupBy = 'person' | 'team' | 'project'

type Props = {
  preset: WorkloadPreset
  onPresetChange: (preset: WorkloadPreset) => void
  customStart: ISODate
  customEnd: ISODate
  onCustomStartChange: (v: ISODate) => void
  onCustomEndChange: (v: ISODate) => void
  scale: TimeScale
  onScaleChange: (scale: TimeScale) => void
  scopeMode: WorkloadScopeMode
  onScopeModeChange: (mode: WorkloadScopeMode) => void
  teamId?: string
  onTeamChange: (teamId: string | undefined) => void
  projectId?: string
  onProjectChange: (projectId: string | undefined) => void
  teams: Team[]
  projects: Project[]
  onExport: () => void
  onEditCapacity: () => void
  canEditCapacity: boolean
  groupBy: WorkloadGroupBy
  onGroupByChange: (value: WorkloadGroupBy) => void
  effortFieldId?: string
  onEffortFieldChange: (value: string | undefined) => void
  effortFields: CustomField[]
}

/** Range, scope, scale controls and export action. */
export function WorkloadToolbar(props: Props) {
  const {
    preset,
    onPresetChange,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    scale,
    onScaleChange,
    scopeMode,
    onScopeModeChange,
    teamId,
    onTeamChange,
    projectId,
    onProjectChange,
    teams,
    projects,
    onExport,
    onEditCapacity,
    canEditCapacity,
    groupBy,
    onGroupByChange,
    effortFieldId,
    onEffortFieldChange,
    effortFields,
  } = props

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={preset} onValueChange={(v) => onPresetChange(v as WorkloadPreset)}>
          <TabsList>
            <TabsTrigger value="this_week">This week</TabsTrigger>
            <TabsTrigger value="next_week">Next week</TabsTrigger>
            <TabsTrigger value="this_month">This month</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
        {preset === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" className="h-9 w-36 text-sm" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} />
            <span style={{ color: 'hsl(var(--foreground-muted))' }}>–</span>
            <Input type="date" className="h-9 w-36 text-sm" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={scopeMode} onValueChange={(v) => onScopeModeChange(v as WorkloadScopeMode)}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="team">By team</SelectItem>
            <SelectItem value="project">By project</SelectItem>
          </SelectContent>
        </Select>
        {scopeMode === 'team' ? (
          <Select value={teamId ?? ''} onValueChange={(v) => onTeamChange(v || undefined)}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent className="z-[100]">
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {scopeMode === 'project' ? (
          <Select value={projectId ?? ''} onValueChange={(v) => onProjectChange(v || undefined)}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent className="z-[100]">
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={scale} onValueChange={(v) => onScaleChange(v as TimeScale)}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="quarter">Quarter</SelectItem>
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={(value) => onGroupByChange(value as WorkloadGroupBy)}>
          <SelectTrigger className="h-9 w-36" aria-label="Group workload by"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]"><SelectItem value="person">Person</SelectItem><SelectItem value="team">Team</SelectItem><SelectItem value="project">Project</SelectItem></SelectContent>
        </Select>

        <Select value={effortFieldId ?? '__default__'} onValueChange={(value) => onEffortFieldChange(value === '__default__' ? undefined : value)}>
          <SelectTrigger className="h-9 w-48" aria-label="Effort field"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]"><SelectItem value="__default__">Automatic estimate</SelectItem>{effortFields.map((field) => <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>)}</SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          {canEditCapacity ? (
            <Button variant="outline" size="sm" onClick={onEditCapacity}>
              <Settings2 className="mr-1 h-4 w-4" /> Edit capacity
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>
    </div>
  )
}
