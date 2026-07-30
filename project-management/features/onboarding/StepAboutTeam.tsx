'use client'

/** Step 2 — team profile form persisted to Workspace.profile. */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { INDUSTRIES, MAX_INDUSTRY_SELECTIONS, ROLES, TEAM_SIZES, USE_CASES } from './constants'

type Props = {
  companyName: string
  onCompanyNameChange: (v: string) => void
  teamSize: string
  onTeamSizeChange: (v: string) => void
  industries: string[]
  onIndustriesChange: (v: string[]) => void
  primaryUseCase: string
  onPrimaryUseCaseChange: (v: string) => void
  role: string
  onRoleChange: (v: string) => void
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={selected}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              selected
                ? 'border-[#cc785c] bg-[#f5e5de] font-medium text-[#9a4f37]'
                : 'border-border text-foreground hover:bg-muted',
            )}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function MultiChipRow({
  options,
  values,
  onChange,
  max,
}: {
  options: readonly string[]
  values: string[]
  onChange: (v: string[]) => void
  max: number
}) {
  const atMax = values.length >= max

  const toggle = (opt: string) => {
    if (values.includes(opt)) {
      onChange(values.filter((v) => v !== opt))
      return
    }
    if (values.length < max) {
      onChange([...values, opt])
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Select up to {max} ({values.length}/{max})
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = values.includes(opt)
          const disabled = atMax && !selected
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => toggle(opt)}
              aria-pressed={selected}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                selected
                  ? 'border-[#cc785c] bg-[#f5e5de] font-medium text-[#9a4f37]'
                  : 'border-border text-foreground hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
              )}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function StepAboutTeam(props: Props) {
  return (
    <div className="grid max-h-[50vh] gap-4 overflow-y-auto py-2">
      <div className="grid gap-2">
        <Label htmlFor="company-name">Company / workspace name</Label>
        <Input
          id="company-name"
          value={props.companyName}
          onChange={(e) => props.onCompanyNameChange(e.target.value)}
          className="tl-input"
        />
      </div>
      <div className="grid gap-2">
        <Label>Your role</Label>
        <ChipRow options={ROLES} value={props.role} onChange={props.onRoleChange} />
      </div>
      <div className="grid gap-2">
        <Label>Team size</Label>
        <ChipRow options={TEAM_SIZES} value={props.teamSize} onChange={props.onTeamSizeChange} />
      </div>
      <div className="grid gap-2">
        <Label>Industry</Label>
        <MultiChipRow
          options={INDUSTRIES}
          values={props.industries}
          onChange={props.onIndustriesChange}
          max={MAX_INDUSTRY_SELECTIONS}
        />
      </div>
      <div className="grid gap-2">
        <Label>Primary use case</Label>
        <ChipRow options={USE_CASES} value={props.primaryUseCase} onChange={props.onPrimaryUseCaseChange} />
      </div>
    </div>
  )
}
