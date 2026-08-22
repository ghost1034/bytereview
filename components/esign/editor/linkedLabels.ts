import type { EditorField, EditorFieldProperties } from './PdfFieldEditor'

export type GeneratedLabelLink = NonNullable<EditorFieldProperties['label_link']>

const GAP = 0.008
const QUESTION_HEIGHT = 0.03
const CHOICE_WIDTH = 0.16

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

export function isLinkedLabel(field: EditorField): boolean {
  return field.fieldType === 'note' && !!field.properties?.label_link
}

function aboveOrBelow(source: EditorField) {
  const width = Math.min(0.3, Math.max(0.15, source.width))
  const height = QUESTION_HEIGHT
  const preferredY = source.posY - height - GAP
  const fallbackY = source.posY + source.height + GAP
  return {
    documentId: source.documentId,
    pageNumber: source.pageNumber,
    posX: clamp(source.posX, 0, 1 - width),
    posY: clamp(preferredY >= 0 ? preferredY : fallbackY, 0, 1 - height),
    width,
    height,
  }
}

function rightOrLeft(source: EditorField) {
  const width = Math.min(CHOICE_WIDTH, Math.max(0.08, 1 - GAP))
  const height = Math.max(0.025, source.height)
  const preferredX = source.posX + source.width + GAP
  const fallbackX = source.posX - width - GAP
  return {
    documentId: source.documentId,
    pageNumber: source.pageNumber,
    posX: clamp(preferredX + width <= 1 ? preferredX : fallbackX, 0, 1 - width),
    posY: clamp(source.posY + (source.height - height) / 2, 0, 1 - height),
    width,
    height,
  }
}

function createLabel(source: EditorField, link: GeneratedLabelLink, text: string, createId: () => string, question: boolean): EditorField {
  return {
    id: createId(),
    ...(question ? aboveOrBelow(source) : rightOrLeft(source)),
    participantId: source.participantId,
    fieldType: 'note',
    required: false,
    label: text,
    properties: {
      schema_version: 2,
      sender_prefill: text,
      read_only: true,
      conditional: source.properties?.conditional ? structuredClone(source.properties.conditional) : undefined,
      label_link: link,
    },
  }
}

function groupDetails(fields: EditorField[], field: EditorField) {
  const radioId = field.fieldType === 'radio' ? field.properties?.group?.id : undefined
  const checkboxId = field.fieldType === 'checkbox' ? field.properties?.selection_group?.id : undefined
  if (!radioId && !checkboxId) return null
  const kind = radioId ? 'radio_group' as const : 'checkbox_group' as const
  const sourceId = radioId ?? checkboxId!
  const members = fields.filter((candidate) => kind === 'radio_group'
    ? candidate.fieldType === 'radio' && candidate.properties?.group?.id === sourceId
    : candidate.fieldType === 'checkbox' && candidate.properties?.selection_group?.id === sourceId)
  const label = kind === 'radio_group'
    ? members[0]?.properties?.group?.label ?? ''
    : members[0]?.properties?.selection_group?.label ?? ''
  return { kind, sourceId, members, label }
}

export function choiceLabelsEnabled(fields: EditorField[], source: EditorField): boolean {
  const group = groupDetails(fields, source)
  const link = group
    ? fields.find((field) => field.properties?.label_link?.kind === group.kind && field.properties.label_link.source_id === group.sourceId)?.properties?.label_link
    : fields.find((field) => field.properties?.label_link?.kind === 'field' && field.properties.label_link.source_id === source.id)?.properties?.label_link
  return link?.enabled ?? false
}

/** Create or restore all labels controlled by one dropdown/group toggle. */
export function setChoiceLabelsEnabled(fields: EditorField[], source: EditorField, enabled: boolean, createId: () => string): EditorField[] {
  const group = groupDetails(fields, source)
  const expected = group
    ? [
        { source: group.members[0], link: { kind: group.kind, source_id: group.sourceId, enabled }, text: group.label, question: true },
        ...group.members.map((member) => ({ source: member, link: { kind: 'field' as const, source_id: member.id, enabled }, text: member.label ?? '', question: false })),
      ]
    : source.fieldType === 'dropdown'
      ? [{ source, link: { kind: 'field' as const, source_id: source.id, enabled }, text: source.label ?? '', question: true }]
      : []
  let next = fields.map((field) => {
    if (!isLinkedLabel(field)) return field
    const matches = expected.some((item) => item.link.kind === field.properties?.label_link?.kind && item.link.source_id === field.properties?.label_link?.source_id)
    return matches ? { ...field, properties: { ...field.properties, label_link: { ...field.properties!.label_link!, enabled } } } : field
  })
  for (const item of expected) {
    if (!item.source) continue
    if (!next.some((field) => field.properties?.label_link?.kind === item.link.kind && field.properties.label_link.source_id === item.link.source_id)) {
      next = [...next, createLabel(item.source, item.link, item.text, createId, item.question)]
    }
  }
  return reconcileLinkedLabels(next)
}

/** Synchronize canonical text/ownership and clean up labels whose source was deleted. */
export function reconcileLinkedLabels(fields: EditorField[], createId?: () => string): EditorField[] {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const groupStates = new Map<string, boolean>()
  for (const field of fields) {
    const link = field.properties?.label_link
    if (link?.kind !== 'radio_group' && link?.kind !== 'checkbox_group') continue
    groupStates.set(`${link.kind}:${link.source_id}`, link.enabled)
  }

  let next = fields.flatMap((field): EditorField[] => {
    const link = field.properties?.label_link
    if (!link) return [field]
    let source: EditorField | undefined
    let text = ''
    let groupKey: string | undefined
    if (link.kind === 'field') {
      source = byId.get(link.source_id)
      if (!source || source.fieldType === 'note') return []
      text = source.label ?? source.properties?.option_value ?? ''
      const group = groupDetails(fields, source)
      if (group) groupKey = `${group.kind}:${group.sourceId}`
      else if (source.fieldType !== 'dropdown') return []
    } else {
      const member = fields.find((candidate) => link.kind === 'radio_group'
        ? candidate.fieldType === 'radio' && candidate.properties?.group?.id === link.source_id
        : candidate.fieldType === 'checkbox' && candidate.properties?.selection_group?.id === link.source_id)
      if (!member) return []
      source = member
      text = link.kind === 'radio_group' ? member.properties?.group?.label ?? '' : member.properties?.selection_group?.label ?? ''
      groupKey = `${link.kind}:${link.source_id}`
    }
    const enabled = groupKey && groupStates.has(groupKey) ? groupStates.get(groupKey)! : link.enabled
    return [{
      ...field,
      participantId: source.participantId,
      label: text,
      properties: {
        ...field.properties,
        sender_prefill: text,
        read_only: true,
        conditional: source.properties?.conditional ? structuredClone(source.properties.conditional) : undefined,
        label_link: { ...link, enabled },
      },
    }]
  })

  if (!createId) return next
  for (const field of fields) {
    const group = groupDetails(fields, field)
    if (!group || field.id !== group.members[0]?.id) continue
    const groupKey = `${group.kind}:${group.sourceId}`
    if (!groupStates.has(groupKey)) continue
    next = setChoiceLabelsEnabled(next, next.find((candidate) => candidate.id === field.id) ?? field, groupStates.get(groupKey)!, createId)
  }
  return next
}
