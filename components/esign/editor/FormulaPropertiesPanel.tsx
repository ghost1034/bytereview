'use client'

import * as React from 'react'
import { AlertCircle, Calculator, CheckCircle2, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { evaluateFormulaDiagnostic, formulaReferences, validateFormula } from '@/lib/esign/fieldLogic'
import type { EditorField } from './PdfFieldEditor'
import {
  FORMULA_RECIPE_LABELS,
  createFormulaRecipe,
  formulaRecipeError,
  formulaRecipeExpression,
  recognizeFormulaRecipe,
  type FormulaOperand,
  type FormulaRecipe,
} from './formulaBuilder'

const FORBIDDEN_REFERENCE_TYPES = new Set(['signature', 'initials', 'stamp', 'attachment'])

interface FormulaSaveValue {
  label?: string
  dataLabel: string
  tooltip?: string
  expression: string
  decimalPlaces: number
}

interface FormulaPropertiesPanelProps {
  field: EditorField
  fields: EditorField[]
  isNew?: boolean
  onApply: (value: FormulaSaveValue) => void
  onCancel: () => void
  onRemove?: () => void
}

function displayName(field: EditorField): string {
  const name = field.label?.trim() || field.properties?.data_label?.trim() || field.fieldType.replace(/_/g, ' ')
  return `${name} · page ${field.pageNumber + 1}`
}

function OperandEditor({ label, operand, fields, onChange, allowText = false }: {
  label: string
  operand: FormulaOperand
  fields: EditorField[]
  onChange: (operand: FormulaOperand) => void
  allowText?: boolean
}) {
  const selected = operand.kind === 'field' ? operand.fieldId : `__${operand.valueType}`
  return <div className="space-y-1">
    <label className="block text-xs font-medium text-foreground-muted">{label}</label>
    <select
      aria-label={label}
      className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      value={selected}
      onChange={(event) => {
        if (event.target.value === '__number') onChange({ kind: 'value', value: '0', valueType: 'number' })
        else if (event.target.value === '__text') onChange({ kind: 'value', value: '', valueType: 'text' })
        else onChange({ kind: 'field', fieldId: event.target.value })
      }}
    >
      <option value="">Choose a field…</option>
      {fields.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate)}</option>)}
      <option value="__number">Number…</option>
      {allowText && <option value="__text">Text…</option>}
    </select>
    {operand.kind === 'value' && <input
      aria-label={`${label} ${operand.valueType}`}
      type={operand.valueType === 'number' ? 'number' : 'text'}
      className="w-full rounded border border-border bg-background px-2 py-1.5"
      value={operand.value}
      onChange={(event) => onChange({ ...operand, value: event.target.value })}
      placeholder={operand.valueType === 'number' ? 'Enter a number' : 'Enter text'}
    />}
  </div>
}

function replaceRecipeOperand(recipe: FormulaRecipe, key: string, operand: FormulaOperand): FormulaRecipe {
  if (recipe.kind === 'sum') return { ...recipe, operands: recipe.operands.map((item, index) => String(index) === key ? operand : item) }
  if (recipe.kind === 'difference' || recipe.kind === 'product' || recipe.kind === 'division') return { ...recipe, [key]: operand }
  if (recipe.kind === 'percentage') return { ...recipe, base: operand }
  if (recipe.kind === 'conditional') return { ...recipe, [key]: operand }
  return recipe
}

function formulaCycleError(field: EditorField, fields: EditorField[], expression: string): string | null {
  const candidates = [...fields.filter((item) => item.id !== field.id), { ...field, properties: { ...field.properties, formula: { expression, decimal_places: field.properties?.formula?.decimal_places ?? 2 } } }]
  const byId = new Map(candidates.map((item) => [item.id, item]))
  const byOwnerLabel = new Map(candidates.flatMap((item) => item.properties?.data_label
    ? [[`${item.participantId}:${item.properties.data_label}`, item] as const] : []))
  const visiting = new Set<string>(); const visited = new Set<string>()
  const visit = (current: EditorField): boolean => {
    if (visiting.has(current.id)) return true
    if (visited.has(current.id)) return false
    visiting.add(current.id)
    for (const reference of formulaReferences(current.properties?.formula?.expression ?? '')) {
      const target = byId.get(reference) ?? byOwnerLabel.get(`${current.participantId}:${reference}`)
      if (target?.fieldType === 'formula' && visit(target)) return true
    }
    visiting.delete(current.id); visited.add(current.id)
    return false
  }
  return visit(candidates.find((item) => item.id === field.id)!) ? 'Formula dependency cycle detected.' : null
}

export function FormulaPropertiesPanel({ field, fields, isNew = false, onApply, onCancel, onRemove }: FormulaPropertiesPanelProps) {
  const storedExpression = field.properties?.formula?.expression ?? ''
  const recognized = React.useMemo(() => recognizeFormulaRecipe(storedExpression), [storedExpression])
  const eligibleFields = React.useMemo(() => fields.filter((candidate) => candidate.id !== field.id && candidate.participantId === field.participantId && !FORBIDDEN_REFERENCE_TYPES.has(candidate.fieldType)), [field.id, field.participantId, fields])
  const fieldIds = React.useMemo(() => eligibleFields.map((candidate) => candidate.id), [eligibleFields])
  const initialRecipe = React.useMemo(() => recognized ?? createFormulaRecipe('sum', fieldIds), [fieldIds, recognized])
  const [mode, setMode] = React.useState<'guided' | 'advanced'>(recognized || isNew ? 'guided' : 'advanced')
  const [recipe, setRecipe] = React.useState<FormulaRecipe>(initialRecipe)
  const [expression, setExpression] = React.useState(isNew ? formulaRecipeExpression(initialRecipe) : storedExpression)
  const [decimalPlaces, setDecimalPlaces] = React.useState(field.properties?.formula?.decimal_places ?? 2)
  const [label, setLabel] = React.useState(field.label ?? '')
  const [dataLabel, setDataLabel] = React.useState(field.properties?.data_label ?? `formula_${field.id.slice(0, 8)}`)
  const [tooltip, setTooltip] = React.useState(field.properties?.tooltip ?? '')
  const [samples, setSamples] = React.useState<Record<string, string>>(() => Object.fromEntries(eligibleFields.map((candidate) => [candidate.id, candidate.properties?.sender_prefill ?? ''])))
  const [confirmGuidedReset, setConfirmGuidedReset] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (mode === 'guided') setExpression(formulaRecipeExpression(recipe))
  }, [mode, recipe])

  const references = React.useMemo(() => formulaReferences(expression), [expression])
  const resolvedReferences = references.map((reference) => eligibleFields.find((candidate) => candidate.id === reference || candidate.properties?.data_label === reference))
  const previewFields = resolvedReferences.filter((candidate, index, items): candidate is EditorField => !!candidate && items.findIndex((item) => item?.id === candidate.id) === index)
  let structuralError: string | null = mode === 'guided' ? formulaRecipeError(recipe) : null
  if (!structuralError) {
    try { validateFormula(expression) } catch (error) { structuralError = error instanceof Error ? error.message : 'Invalid formula' }
  }
  if (!structuralError && resolvedReferences.some((candidate) => !candidate)) structuralError = 'Choose fields assigned to the same recipient; one reference is missing or unavailable.'
  if (!structuralError && references.some((reference) => reference === field.id || reference === field.properties?.data_label)) structuralError = 'A formula cannot reference itself.'
  if (!structuralError) structuralError = formulaCycleError(field, fields, expression)

  const sampleValues: Record<string, string> = {}
  resolvedReferences.forEach((candidate, index) => {
    if (!candidate) return
    sampleValues[candidate.id] = samples[candidate.id] ?? ''
    if (candidate.properties?.data_label) sampleValues[candidate.properties.data_label] = samples[candidate.id] ?? ''
    sampleValues[references[index]] = samples[candidate.id] ?? ''
  })
  const needsSamples = previewFields.some((candidate) => !(samples[candidate.id] ?? '').trim())
  const preview = structuralError || needsSamples ? null : evaluateFormulaDiagnostic(expression, sampleValues, decimalPlaces)

  const switchToGuided = () => {
    const nextRecipe = recognizeFormulaRecipe(expression)
    if (!nextRecipe) { setConfirmGuidedReset(true); return }
    setRecipe(nextRecipe); setMode('guided'); setConfirmGuidedReset(false)
  }
  const insertReference = (reference: string) => {
    if (!reference) return
    const input = textareaRef.current
    const start = input?.selectionStart ?? expression.length
    const end = input?.selectionEnd ?? expression.length
    const next = `${expression.slice(0, start)}[${reference}]${expression.slice(end)}`
    setExpression(next)
    window.setTimeout(() => { input?.focus(); input?.setSelectionRange(start + reference.length + 2, start + reference.length + 2) }, 0)
  }
  const updateRecipeKind = (kind: FormulaRecipe['kind']) => setRecipe(createFormulaRecipe(kind, fieldIds))

  return <div className="space-y-3 rounded-md border border-border bg-surface p-3 text-sm" data-testid="formula-properties-panel">
    <div className="flex items-center gap-2"><Calculator className="size-4 text-primary" /><div><p className="font-semibold">{isNew ? 'Set up formula' : 'Edit formula'}</p><p className="text-xs text-foreground-muted">Calculate a value automatically for this recipient.</p></div></div>
    <label className="block"><span className="mb-1 block text-xs font-medium">Result label</span><input className="w-full rounded border border-border bg-background px-2 py-1.5" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Total due" /></label>

    <div className="grid grid-cols-2 rounded-md bg-surface-muted p-1" role="tablist" aria-label="Formula editor mode">
      <button type="button" role="tab" aria-selected={mode === 'guided'} className={`rounded px-2 py-1.5 text-xs font-medium ${mode === 'guided' ? 'bg-background text-foreground shadow-sm' : 'text-foreground-muted'}`} onClick={switchToGuided}>Guided</button>
      <button type="button" role="tab" aria-selected={mode === 'advanced'} className={`rounded px-2 py-1.5 text-xs font-medium ${mode === 'advanced' ? 'bg-background text-foreground shadow-sm' : 'text-foreground-muted'}`} onClick={() => { setMode('advanced'); setConfirmGuidedReset(false) }}>Advanced</button>
    </div>

    {confirmGuidedReset && <div className="space-y-2 rounded-md border border-warning/40 bg-warning-soft p-2 text-xs text-warning"><p>This expression is more complex than the guided recipes. Starting a recipe will replace the local draft.</p><div className="flex gap-2"><Button type="button" size="sm" className="h-7 text-xs" onClick={() => { const next = createFormulaRecipe('sum', fieldIds); setRecipe(next); setMode('guided'); setConfirmGuidedReset(false) }}>Start guided formula</Button><Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmGuidedReset(false)}>Keep expression</Button></div></div>}

    {mode === 'guided' ? <div className="space-y-3">
      <label className="block"><span className="mb-1 block text-xs font-medium">Calculation</span><select aria-label="Calculation recipe" className="w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.kind} onChange={(event) => updateRecipeKind(event.target.value as FormulaRecipe['kind'])}>{Object.entries(FORMULA_RECIPE_LABELS).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label>
      {recipe.kind === 'sum' && <div className="space-y-2">{recipe.operands.map((operand, index) => <div key={index} className="flex items-end gap-1"><div className="min-w-0 flex-1"><OperandEditor label={`Value ${index + 1}`} operand={operand} fields={eligibleFields} onChange={(next) => setRecipe(replaceRecipeOperand(recipe, String(index), next))} /></div>{recipe.operands.length > 2 && <button type="button" className="mb-1 rounded p-1.5 text-foreground-muted hover:bg-destructive-soft hover:text-destructive" aria-label={`Remove value ${index + 1}`} onClick={() => setRecipe({ ...recipe, operands: recipe.operands.filter((_, itemIndex) => itemIndex !== index) })}><X className="size-4" /></button>}</div>)}<Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setRecipe({ ...recipe, operands: [...recipe.operands, { kind: 'field', fieldId: fieldIds[0] ?? '' }] })}><Plus className="mr-1 size-3.5" /> Add value</Button></div>}
      {(recipe.kind === 'difference' || recipe.kind === 'product' || recipe.kind === 'division') && <><OperandEditor label="First value" operand={recipe.left} fields={eligibleFields} onChange={(next) => setRecipe(replaceRecipeOperand(recipe, 'left', next))} /><OperandEditor label={recipe.kind === 'difference' ? 'Subtract' : recipe.kind === 'division' ? 'Divide by' : 'Multiply by'} operand={recipe.right} fields={eligibleFields} onChange={(next) => setRecipe(replaceRecipeOperand(recipe, 'right', next))} /></>}
      {recipe.kind === 'percentage' && <><OperandEditor label="Value" operand={recipe.base} fields={eligibleFields} onChange={(next) => setRecipe({ ...recipe, base: next })} /><label className="block text-xs font-medium text-foreground-muted">Percentage<input aria-label="Percentage" type="number" className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.percentage} onChange={(event) => setRecipe({ ...recipe, percentage: event.target.value })} /></label></>}
      {recipe.kind === 'conditional' && <><OperandEditor label="If this value" operand={recipe.source} fields={eligibleFields} onChange={(next) => setRecipe({ ...recipe, source: next })} /><label className="block text-xs font-medium text-foreground-muted">Comparison<select aria-label="Comparison" className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.comparator} onChange={(event) => setRecipe({ ...recipe, comparator: event.target.value as typeof recipe.comparator })}><option value="==">Equals</option><option value="!=">Does not equal</option><option value=">">Is greater than</option><option value=">=">Is at least</option><option value="<">Is less than</option><option value="<=">Is at most</option></select></label><OperandEditor label="Compare with" operand={recipe.comparison} fields={eligibleFields} allowText onChange={(next) => setRecipe({ ...recipe, comparison: next })} /><OperandEditor label="Then return" operand={recipe.whenTrue} fields={eligibleFields} allowText onChange={(next) => setRecipe({ ...recipe, whenTrue: next })} /><OperandEditor label="Otherwise return" operand={recipe.whenFalse} fields={eligibleFields} allowText onChange={(next) => setRecipe({ ...recipe, whenFalse: next })} /></>}
      {recipe.kind === 'date_difference' && <><label className="block text-xs font-medium text-foreground-muted">Start date<select aria-label="Start date" className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.startFieldId} onChange={(event) => setRecipe({ ...recipe, startFieldId: event.target.value })}><option value="">Choose a date field…</option>{eligibleFields.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate)}</option>)}</select></label><label className="block text-xs font-medium text-foreground-muted">End date<select aria-label="End date" className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.endFieldId} onChange={(event) => setRecipe({ ...recipe, endFieldId: event.target.value })}><option value="">Choose a date field…</option>{eligibleFields.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate)}</option>)}</select></label></>}
      {recipe.kind === 'date_add' && <><label className="block text-xs font-medium text-foreground-muted">Date<select aria-label="Date" className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.dateFieldId} onChange={(event) => setRecipe({ ...recipe, dateFieldId: event.target.value })}><option value="">Choose a date field…</option>{eligibleFields.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate)}</option>)}</select></label><label className="block text-xs font-medium text-foreground-muted">Days to add<input aria-label="Days to add" type="number" step={1} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={recipe.days} onChange={(event) => setRecipe({ ...recipe, days: event.target.value })} /></label></>}
      {!eligibleFields.length && <p className="rounded-md bg-warning-soft p-2 text-xs text-warning">Add an eligible field for this recipient before creating a guided calculation.</p>}
    </div> : <div className="space-y-2">
      <label className="block text-xs font-medium">Expression<textarea ref={textareaRef} rows={4} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs" value={expression} onChange={(event) => setExpression(event.target.value)} aria-describedby="formula-syntax-help" /></label>
      <select aria-label="Insert field reference" className="w-full rounded border border-border bg-background px-2 py-1.5" value="" onChange={(event) => insertReference(event.target.value)}><option value="">Insert field reference…</option>{eligibleFields.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate)}</option>)}</select>
      <details id="formula-syntax-help" className="text-xs text-foreground-muted"><summary className="cursor-pointer font-medium">Operators and functions</summary><p className="mt-1">Use +, −, *, /, parentheses, and comparisons. Functions: IF, ROUND, SUM, MIN, MAX, FLOOR, CEILING, DATEADD, and DATEDIFF.</p></details>
    </div>}

    <label className="block text-xs font-medium text-foreground-muted">Decimal places<input aria-label="Decimal places" type="number" min={0} max={10} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5" value={decimalPlaces} onChange={(event) => setDecimalPlaces(Math.max(0, Math.min(10, Number(event.target.value))))} /></label>

    {!!previewFields.length && <fieldset className="space-y-2 rounded-md border border-border p-2"><legend className="px-1 text-xs font-medium">Try sample values</legend>{previewFields.map((candidate) => <label key={candidate.id} className="block text-xs text-foreground-muted">{displayName(candidate)}<input aria-label={`Sample value for ${displayName(candidate)}`} type={candidate.fieldType === 'date' ? 'date' : candidate.fieldType === 'number' ? 'number' : 'text'} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-foreground" value={samples[candidate.id] ?? ''} onChange={(event) => setSamples((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="Enter a sample value" /></label>)}</fieldset>}

    <div className={`rounded-md border p-2 ${structuralError || preview?.error ? 'border-destructive/30 bg-destructive-soft' : 'border-success/30 bg-success-soft'}`} aria-live="polite">
      {structuralError || preview?.error ? <div className="flex gap-2 text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div><p className="text-xs font-medium">Formula needs attention</p><p className="text-xs">{structuralError || preview?.error}</p></div></div> : needsSamples ? <div className="flex gap-2 text-foreground-muted"><Calculator className="mt-0.5 size-4 shrink-0" /><p className="text-xs">Enter sample values above to preview the result.</p></div> : <div className="flex gap-2 text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><div><p className="text-xs font-medium">Preview</p><output className="break-all text-base font-semibold text-foreground">{preview?.value}</output></div></div>}
    </div>

    <details className="space-y-2"><summary className="cursor-pointer text-xs font-medium">Advanced field details</summary><div className="mt-2 space-y-2"><label className="block text-xs text-foreground-muted">Data label<input className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-foreground" value={dataLabel} onChange={(event) => setDataLabel(event.target.value)} /></label><label className="block text-xs text-foreground-muted">Tooltip<input className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-foreground" value={tooltip} onChange={(event) => setTooltip(event.target.value)} /></label></div></details>
    <div className="flex gap-2"><Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="button" size="sm" className="flex-1" disabled={!!structuralError} onClick={() => onApply({ label: label.trim() || undefined, dataLabel: dataLabel.trim() || `formula_${field.id.slice(0, 8)}`, tooltip: tooltip.trim() || undefined, expression, decimalPlaces })}>{isNew ? 'Add formula' : 'Apply'}</Button></div>
    {onRemove && <Button type="button" variant="outline" size="sm" className="w-full text-destructive" onClick={onRemove}><Trash2 className="mr-1.5 size-3.5" /> Remove formula</Button>}
  </div>
}
