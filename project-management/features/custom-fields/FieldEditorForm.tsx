'use client'

/** Form body for create/edit custom field dialog. */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { newId } from '../../lib/ids'
import { asExtendedField } from '../../lib/customFields/fieldConfig'
import { evaluateFormula } from '../../lib/customFields/formula'
import {
  editorTypeToFieldType,
  FIELD_EDITOR_TYPES,
  fieldTypeToEditorType,
  OPTION_COLORS,
  type FieldEditorType,
} from '../../lib/customFields/fieldTypes'
import type { CustomField, EnumOption } from '../../types'

export type FieldEditorState = {
  name: string
  description: string
  editorType: FieldEditorType
  isGlobal: boolean
  notify: boolean
  showOnCard: boolean
  required: boolean
  multiline: boolean
  peopleMulti: boolean
  includeTime: boolean
  numberFormat: 'plain' | 'percent' | 'currency'
  currencySymbol: string
  customLabel: string
  numberPrecision: string
  numberMin: string
  numberMax: string
  formulaExpression: string
  options: EnumOption[]
}

export function defaultEditorState(field?: CustomField, defaultGlobal = true): FieldEditorState {
  if (field) {
    const ext = asExtendedField(field)
    return {
      name: field.name,
      description: field.description ?? '',
      editorType: fieldTypeToEditorType(field.type),
      isGlobal: field.isGlobal,
      notify: field.notify,
      showOnCard: false,
      required: Boolean(ext.required),
      multiline: Boolean(ext.multiline),
      peopleMulti: ext.peopleMulti !== false,
      includeTime: Boolean(ext.includeTime),
      numberFormat: field.numberFormat ?? 'plain',
      currencySymbol: field.currencySymbol ?? '$',
      customLabel: ext.customLabel ?? '',
      numberPrecision: ext.numberPrecision != null ? String(ext.numberPrecision) : '',
      numberMin: ext.numberMin != null ? String(ext.numberMin) : '',
      numberMax: ext.numberMax != null ? String(ext.numberMax) : '',
      formulaExpression: ext.formulaExpression ?? '',
      options: field.options ?? [],
    }
  }
  return {
    name: '',
    description: '',
    editorType: 'text',
    isGlobal: defaultGlobal,
    notify: false,
    showOnCard: false,
    required: false,
    multiline: false,
    peopleMulti: true,
    includeTime: false,
    numberFormat: 'plain',
    currencySymbol: '$',
    customLabel: '',
    numberPrecision: '',
    numberMin: '',
    numberMax: '',
    formulaExpression: '',
    options: [
      { id: newId(), label: 'Option 1', color: 'gray' },
      { id: newId(), label: 'Option 2', color: 'accent' },
    ],
  }
}

type Props = {
  state: FieldEditorState
  onChange: (next: FieldEditorState) => void
  numberFields: CustomField[]
}

export function FieldEditorForm({ state, onChange, numberFields }: Props) {
  const set = <K extends keyof FieldEditorState>(key: K, value: FieldEditorState[K]) =>
    onChange({ ...state, [key]: value })

  const mappedType = editorTypeToFieldType(state.editorType)
  const needsOptions = state.editorType === 'enum' || state.editorType === 'multi_enum'

  const formulaPreview = useMemo(() => {
    if (state.editorType !== 'formula' || !state.formulaExpression.trim()) return null
    return evaluateFormula(state.formulaExpression, (name) => {
      const f = numberFields.find((x) => x.name.toLowerCase() === name.toLowerCase())
      return f ? 1 : 0
    })
  }, [numberFields, state.editorType, state.formulaExpression])

  const addOption = () => {
    set('options', [
      ...state.options,
      {
        id: newId(),
        label: `Option ${state.options.length + 1}`,
        color: OPTION_COLORS[state.options.length % OPTION_COLORS.length],
      },
    ])
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="cf-name">Name</Label>
        <Input id="cf-name" value={state.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div>
        <Label htmlFor="cf-type">Type</Label>
        <Select value={state.editorType} onValueChange={(v) => set('editorType', v as FieldEditorType)}>
          <SelectTrigger id="cf-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            {FIELD_EDITOR_TYPES.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="cf-desc">Description</Label>
        <Textarea id="cf-desc" value={state.description} onChange={(e) => set('description', e.target.value)} rows={2} />
      </div>

      {state.editorType === 'text' ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={state.multiline} onCheckedChange={(v) => set('multiline', Boolean(v))} />
          Multiline text
        </label>
      ) : null}

      {state.editorType === 'number' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Format</Label>
            <Select value={state.numberFormat} onValueChange={(v) => set('numberFormat', v as typeof state.numberFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                <SelectItem value="plain">Plain</SelectItem>
                <SelectItem value="percent">Percent</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.numberFormat === 'currency' ? (
            <div>
              <Label>Symbol</Label>
              <Input value={state.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} />
            </div>
          ) : null}
          <div>
            <Label>Label suffix</Label>
            <Input value={state.customLabel} placeholder="h, items…" onChange={(e) => set('customLabel', e.target.value)} />
          </div>
          <div>
            <Label>Precision</Label>
            <Input value={state.numberPrecision} type="number" onChange={(e) => set('numberPrecision', e.target.value)} />
          </div>
          <div>
            <Label>Min</Label>
            <Input value={state.numberMin} type="number" onChange={(e) => set('numberMin', e.target.value)} />
          </div>
          <div>
            <Label>Max</Label>
            <Input value={state.numberMax} type="number" onChange={(e) => set('numberMax', e.target.value)} />
          </div>
        </div>
      ) : null}

      {state.editorType === 'date' ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={state.includeTime} onCheckedChange={(v) => set('includeTime', Boolean(v))} />
          Include time
        </label>
      ) : null}

      {state.editorType === 'person' ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={state.peopleMulti} onCheckedChange={(v) => set('peopleMulti', Boolean(v))} />
          Allow multiple people
        </label>
      ) : null}

      {needsOptions ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Options</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addOption}>+ Add</Button>
          </div>
          {state.options.map((opt, idx) => (
            <div key={opt.id} className="flex gap-2">
              <Input
                value={opt.label}
                onChange={(e) =>
                  set(
                    'options',
                    state.options.map((o, i) => (i === idx ? { ...o, label: e.target.value } : o))
                  )
                }
              />
              <Select
                value={opt.color}
                onValueChange={(v) =>
                  set(
                    'options',
                    state.options.map((o, i) => (i === idx ? { ...o, color: v } : o))
                  )
                }
              >
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent className="tl-popover-surface z-[100]">
                  {OPTION_COLORS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : null}

      {state.editorType === 'formula' ? (
        <div className="space-y-2">
          <Label>Expression</Label>
          <Textarea
            value={state.formulaExpression}
            placeholder="e.g. [Hours] * 75 or IF([Done], 100, [Progress])"
            rows={3}
            onChange={(e) => set('formulaExpression', e.target.value)}
          />
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Reference number/checkbox fields as [Field Name]. Supports + − × ÷, IF(cond,a,b), SUM(a,b).
          </p>
          {formulaPreview ? (
            formulaPreview.ok ? (
              <p className="text-xs" style={{ color: 'var(--accent)' }}>Preview: {formulaPreview.value ?? 'empty'}</p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>{formulaPreview.error}</p>
            )
          ) : null}
          {numberFields.length ? (
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Refs: {numberFields.map((f) => f.name).join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.editorType === 'enum' ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={state.notify} onCheckedChange={(v) => set('notify', Boolean(v))} />
          Notify collaborators when this field changes
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <Switch checked={state.required} onCheckedChange={(v) => set('required', Boolean(v))} />
        Required before completing task
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={state.isGlobal} onCheckedChange={(v) => set('isGlobal', Boolean(v))} />
        Save to workspace field library
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={state.showOnCard} onCheckedChange={(v) => set('showOnCard', Boolean(v))} />
        Show on board card
      </label>

      <input type="hidden" aria-hidden value={mappedType} readOnly />
    </div>
  )
}

export function stateToSavePayload(state: FieldEditorState, workspaceId: string, userId: string) {
  const type = editorTypeToFieldType(state.editorType)
  const needsOptions = state.editorType === 'enum' || state.editorType === 'multi_enum'
  return {
    workspaceId,
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    type,
    isGlobal: state.isGlobal,
    notify: state.editorType === 'enum' ? state.notify : false,
    numberFormat: state.editorType === 'number' ? state.numberFormat : undefined,
    currencySymbol: state.numberFormat === 'currency' ? state.currencySymbol : undefined,
    customLabel: state.customLabel.trim() || undefined,
    numberPrecision: state.numberPrecision ? Number(state.numberPrecision) : undefined,
    numberMin: state.numberMin ? Number(state.numberMin) : undefined,
    numberMax: state.numberMax ? Number(state.numberMax) : undefined,
    multiline: state.editorType === 'text' ? state.multiline : undefined,
    peopleMulti: state.editorType === 'person' ? state.peopleMulti : undefined,
    includeTime: state.editorType === 'date' ? state.includeTime : undefined,
    required: state.required,
    formulaExpression: state.editorType === 'formula' ? state.formulaExpression.trim() : undefined,
    options: needsOptions ? state.options : undefined,
    createdBy: userId,
    showOnCard: state.showOnCard,
  }
}
