/**
 * Custom fields lib — actions, formula, query helpers.
 */
export {
  addFieldToProject,
  removeFieldFromProject,
  reorderProjectFields,
  createField,
  createCustomField,
  updateField,
  updateCustomField,
  deleteField,
  archiveField,
  setTaskFieldValue,
  setTaskCustomFieldValue,
  getTaskFieldValue,
  computeFormula,
  countProjectsUsingField,
  countTasksUsingField,
} from './customFieldActions'
export { evaluateFormula } from './formula'
export {
  buildCustomFieldFilterDefs,
  customFieldGroupKey,
  customFieldSortKey,
  customFieldGroupMeta,
  getSortableScalar,
  CUSTOM_FIELD_TYPES_REFERENCE,
} from './queryHelpers'
export { ensureRecommendedFields, RECOMMENDED_FIELD_SPECS, addRecommendedFieldToProject } from './seedRecommendedFields'
export { fieldTypeLabel, fieldTypeToEditorType } from './fieldTypes'
export { formatNumberDisplay, validateNumberInput } from './formatValue'
export { isFieldArchived, filterActiveFields, asExtendedField } from './fieldConfig'
export { isRequiredFieldEmpty } from './fieldValues'
