import type { FieldSpec } from "./EntityFormDrawer";
import { DOC_TYPES, MEASURE_STATUSES, OUTCOMES, RATE_KIND_LABEL, REGIONS, REG_STATUSES, SIGNIFICANCE, TARIFF_MEASURES, TARIFF_MEASURE_LABEL, TAX_TYPES, TAX_TYPE_LABEL, titleCaseOptions } from "@/taxatlas-ui/lib/enums";

const taxTypeOptions = TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABEL[t] }));
const rateKindOptions = Object.entries(RATE_KIND_LABEL).map(([value, label]) => ({ value, label }));
const confidenceOptions = ["verified", "reported", "estimated"].map((c) => ({ value: c, label: c }));

/** Shared rate fields (everything RatePatch accepts). */
const RATE_VALUE_FIELDS: FieldSpec[] = [
  { key: "rate", label: "Rate (%)", type: "number", half: true, mono: true, placeholder: "e.g. 20", step: "0.001" },
  { key: "confidence", label: "Confidence", type: "select", half: true, options: confidenceOptions },
  { key: "threshold_amount", label: "Threshold amount", type: "number", half: true, mono: true, placeholder: "e.g. 100000", step: "1" },
  { key: "threshold_currency", label: "Threshold currency", type: "text", half: true, mono: true, placeholder: "USD" },
  { key: "effective_from", label: "Effective from", type: "date", half: true },
  { key: "effective_to", label: "Effective to", type: "date", half: true },
  { key: "as_of", label: "As of (verification date)", type: "date", half: true },
  { key: "source_name", label: "Source name", type: "text", half: true },
  { key: "source_url", label: "Source URL", type: "url", placeholder: "https://" },
  { key: "description", label: "Description", type: "text" },
  { key: "applies_to", label: "Applies to", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

/** Record a new rate (POST /admin/rates, supersede=true): tax_type/rate_kind are natural keys, effective_from required. */
export const RATE_RECORD_FIELDS: FieldSpec[] = [
  { key: "tax_type", label: "Tax type", type: "select", required: true, half: true, options: taxTypeOptions, createOnly: true },
  { key: "rate_kind", label: "Rate kind", type: "select", required: true, half: true, options: rateKindOptions, createOnly: true },
  ...RATE_VALUE_FIELDS.map((f) => (f.key === "effective_from" ? { ...f, required: true, help: "The open row with the same tax type/kind is closed the day before" } : f)),
];

/** Correct an existing row (PATCH /admin/rates/{id}) — no natural-key edits. */
export const RATE_CORRECT_FIELDS: FieldSpec[] = RATE_VALUE_FIELDS;

export const REGULATION_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "tax_type", label: "Tax type", type: "select", required: true, half: true, options: taxTypeOptions },
  { key: "doc_type", label: "Document type", type: "select", half: true, options: titleCaseOptions(DOC_TYPES) },
  { key: "status", label: "Status", type: "select", half: true, options: titleCaseOptions(REG_STATUSES) },
  { key: "authority", label: "Authority", type: "text", half: true },
  { key: "reference", label: "Reference", type: "text", half: true, mono: true },
  { key: "published_date", label: "Published", type: "date", half: true },
  { key: "effective_date", label: "Effective", type: "date", half: true },
  { key: "source_url", label: "Source URL", type: "url", required: true, placeholder: "https://", createOnly: true, help: "Must be unique across regulations" },
  { key: "summary", label: "Summary", type: "textarea" },
  { key: "body_excerpt", label: "Body excerpt", type: "textarea" },
  { key: "tags", label: "Tags", type: "tags", placeholder: "comma, separated" },
];

export const DECISION_FIELDS: FieldSpec[] = [
  { key: "case_name", label: "Case name", type: "text", required: true },
  { key: "court", label: "Court", type: "text", required: true, half: true },
  { key: "decision_date", label: "Decided", type: "date", half: true },
  { key: "citation", label: "Citation", type: "text", half: true, mono: true },
  { key: "docket", label: "Docket", type: "text", half: true, mono: true },
  { key: "significance", label: "Significance", type: "select", half: true, options: titleCaseOptions(SIGNIFICANCE) },
  { key: "outcome", label: "Outcome", type: "select", half: true, options: titleCaseOptions(OUTCOMES) },
  { key: "tax_types", label: "Tax types", type: "tags", placeholder: "vat, corporate_income", help: "Comma-separated enum values" },
  { key: "source_url", label: "Source URL", type: "url", required: true, placeholder: "https://", createOnly: true, help: "Must be unique across decisions" },
  { key: "holding", label: "Holding", type: "textarea" },
  { key: "summary", label: "Summary", type: "textarea" },
  { key: "tags", label: "Tags", type: "tags", placeholder: "comma, separated" },
];

export const TARIFF_FIELDS: FieldSpec[] = [
  { key: "product_description", label: "Product description", type: "text", required: true },
  { key: "measure_type", label: "Measure", type: "select", required: true, half: true, options: TARIFF_MEASURES.map((m) => ({ value: m, label: TARIFF_MEASURE_LABEL[m] })) },
  { key: "status", label: "Status", type: "select", half: true, options: titleCaseOptions(MEASURE_STATUSES) },
  { key: "partner_jurisdiction_code", label: "Partner code", type: "text", half: true, mono: true, placeholder: "CN (blank = all)" },
  { key: "partner_scope", label: "Partner scope", type: "text", half: true, placeholder: "e.g. All WTO members" },
  { key: "hs_code", label: "HS code", type: "text", half: true, mono: true, placeholder: "8703" },
  { key: "rate", label: "Rate (%)", type: "number", half: true, mono: true, step: "0.001" },
  { key: "rate_text", label: "Rate text", type: "text", half: true, placeholder: "e.g. 25% + $50/t" },
  { key: "effective_from", label: "Effective from", type: "date", half: true },
  { key: "effective_to", label: "Effective to", type: "date", half: true },
  { key: "source_url", label: "Source URL", type: "url", half: true, placeholder: "https://" },
  { key: "legal_basis", label: "Legal basis", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const JURISDICTION_PROFILE_FIELDS: FieldSpec[] = [
  { key: "name", label: "Name", type: "text", required: true, half: true },
  { key: "region", label: "Region", type: "select", half: true, options: REGIONS.map((r) => ({ value: r, label: r })) },
  { key: "currency", label: "Currency", type: "text", half: true, mono: true, placeholder: "EUR" },
  { key: "lat", label: "Latitude", type: "number", half: true, mono: true, step: "0.0001" },
  { key: "lon", label: "Longitude", type: "number", half: true, mono: true, step: "0.0001" },
  { key: "tax_authority_name", label: "Tax authority", type: "text", half: true },
  { key: "tax_authority_url", label: "Authority URL", type: "url", placeholder: "https://" },
  { key: "summary", label: "Summary", type: "textarea" },
  { key: "has_subnational_taxes", label: "Sub-national taxes", type: "checkbox", half: true, help: "Has sub-national tax competence" },
  { key: "is_active", label: "Active", type: "checkbox", half: true, help: "Visible in lists and map" },
];
