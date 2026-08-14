'use client'

/** Chart builder step 1 — data source and scope picker. */
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ChartBuilderDraft } from '../../lib/reporting/types'
import { reportingSources } from '../../lib/reporting/sourceRegistry'
import type { Portfolio, Project, SavedView, Team } from '../../types'

type Props = {
  draft: ChartBuilderDraft
  onChange: (patch: Partial<ChartBuilderDraft>) => void
  projects: Project[]
  portfolios: Portfolio[]
  teams: Team[]
  savedViews: SavedView[]
}

/** Pick chart source entity and scope boundary. */
export function ChartSourcePicker({ draft, onChange, projects, portfolios, teams, savedViews }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Data source</Label>
        <Select value={draft.source} onValueChange={(v) => onChange({ source: v as ChartBuilderDraft['source'] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {reportingSources().map((source) => (
              <SelectItem key={source.id} value={source.id}>{source.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Scope</Label>
        <Select
          value={draft.scope.type}
          onValueChange={(type) => {
            if (type === 'workspace') onChange({ scope: { type: 'workspace' } })
            else if (type === 'project') onChange({ scope: { type: 'project', id: projects[0]?.id ?? '' } })
            else if (type === 'portfolio') onChange({ scope: { type: 'portfolio', id: portfolios[0]?.id ?? '' } })
            else if (type === 'team') onChange({ scope: { type: 'team', id: teams[0]?.id ?? '' } })
            else onChange({ scope: { type: 'view', id: savedViews[0]?.id ?? '' } })
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="workspace">Across the workspace</SelectItem>
            <SelectItem value="portfolio">Specific portfolio</SelectItem>
            <SelectItem value="team">Specific team</SelectItem>
            <SelectItem value="project">Specific project</SelectItem>
            <SelectItem value="view">Saved view</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {draft.scope.type === 'project' ? (
        <Select value={draft.scope.id} onValueChange={(id) => onChange({ scope: { type: 'project', id } })}>
          <SelectTrigger>
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {draft.scope.type === 'portfolio' ? (
        <Select value={draft.scope.id} onValueChange={(id) => onChange({ scope: { type: 'portfolio', id } })}>
          <SelectTrigger>
            <SelectValue placeholder="Portfolio" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {portfolios.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {draft.scope.type === 'team' ? (
        <Select value={draft.scope.id} onValueChange={(id) => onChange({ scope: { type: 'team', id } })}>
          <SelectTrigger>
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {draft.scope.type === 'view' ? (
        <Select value={draft.scope.id} onValueChange={(id) => onChange({ scope: { type: 'view', id } })}>
          <SelectTrigger>
            <SelectValue placeholder="Saved view" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {savedViews.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
