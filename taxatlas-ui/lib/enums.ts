/* Display labels for enum values (mirrors backend/app/models/enums.py). */

export const TAX_TYPE_LABEL: Record<string, string> = {
  vat: "VAT",
  gst: "GST",
  sales_use: "Sales & use",
  corporate_income: "Corporate income",
  personal_income: "Personal income",
  withholding: "Withholding",
  capital_gains: "Capital gains",
  digital_services: "Digital services",
  customs_tariff: "Customs / tariff",
  excise: "Excise",
  payroll_social: "Payroll / social",
  property: "Property",
  transfer_pricing: "Transfer pricing",
  pillar_two: "Pillar Two",
  other: "Other",
};
export const TAX_TYPES = Object.keys(TAX_TYPE_LABEL);

export const RATE_KIND_LABEL: Record<string, string> = {
  standard: "Standard",
  reduced: "Reduced",
  super_reduced: "Super-reduced",
  zero: "Zero",
  headline: "Headline",
  federal: "Federal",
  state_average: "State average",
  top_marginal: "Top marginal",
  dividends: "Dividends",
  interest: "Interest",
  royalties: "Royalties",
  services: "Services",
  registration_threshold: "Registration threshold",
  economic_nexus_threshold: "Economic nexus threshold",
  minimum: "Minimum",
  trade_tax: "Trade tax",
  regional: "Regional",
  stamp_duty: "Stamp / transfer duty",
  other: "Other",
};

export const REG_STATUSES = ["proposed", "consultation", "enacted", "effective", "amended", "repealed", "guidance", "unknown"];
export const DOC_TYPES = ["statute", "regulation", "ruling", "guidance", "directive", "treaty", "news", "consultation", "other"];
export const SIGNIFICANCE = ["landmark", "significant", "routine"];
export const OUTCOMES = ["taxpayer", "government", "mixed", "pending", "remanded"];
export const TARIFF_MEASURES = [
  "mfn", "preferential", "antidumping", "countervailing", "safeguard", "section_232", "section_301", "ieepa",
  "retaliatory", "cbam", "quota", "export_control", "other",
];
export const TARIFF_MEASURE_LABEL: Record<string, string> = {
  mfn: "MFN",
  preferential: "Preferential",
  antidumping: "Anti-dumping",
  countervailing: "Countervailing",
  safeguard: "Safeguard",
  section_232: "Section 232",
  section_301: "Section 301",
  ieepa: "IEEPA",
  retaliatory: "Retaliatory",
  cbam: "CBAM",
  quota: "Quota",
  export_control: "Export control",
  other: "Other",
};
export const MEASURE_STATUSES = ["proposed", "in_force", "suspended", "expired", "revoked", "under_review"];
export const ENTITY_TYPES = ["rate", "regulation", "court_decision", "tariff", "jurisdiction"];
export const CHANGE_TYPES = ["created", "updated", "rate_changed", "status_changed", "removed"];
export const LEVELS = ["supranational", "country", "state", "province", "territory", "region", "city"];
/* Regions as seeded (see /stats/overview by_region). */
export const REGIONS = ["Africa", "Asia-Pacific", "Caribbean", "Central America", "Europe", "Middle East", "North America", "Oceania", "South America"];
export const CONFIDENCE = ["verified", "reported", "estimated"];
export const CRAWL_STATUSES = ["running", "success", "failed", "skipped", "unchanged"];
export const SOURCE_CATEGORIES = ["regulation", "court", "tariff", "rates", "news"];
export const ADAPTERS = ["rss", "html", "json", "fixture"];

export const LEVEL_LABEL: Record<string, string> = {
  supranational: "Supranational",
  country: "Country",
  state: "State",
  province: "Province",
  territory: "Territory",
  region: "Region",
  city: "City",
};
export const ENTITY_LABEL: Record<string, string> = {
  rate: "Rate",
  regulation: "Regulation",
  court_decision: "Court decision",
  tariff: "Tariff",
  jurisdiction: "Jurisdiction",
};
export const CHANGE_TYPE_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  rate_changed: "Rate changed",
  status_changed: "Status changed",
  removed: "Removed",
};

/* ---------------------------------------------------------------- marker tone maps (components.md §5)
   Status markers carry a shape cue plus colour; the word is always rendered next to the dot. */
export type StatusTone = "positive" | "info" | "pending" | "halt" | "negative" | "neutral";
export const STATUS_TONE: Record<string, StatusTone> = {
  // regulation status
  proposed: "pending",
  consultation: "pending",
  enacted: "info",
  effective: "positive",
  amended: "info",
  repealed: "halt",
  guidance: "neutral",
  unknown: "neutral",
  // tariff measure status
  in_force: "positive",
  suspended: "halt",
  expired: "halt",
  revoked: "negative",
  under_review: "pending",
  // crawl / run status
  running: "pending",
  success: "positive",
  failed: "negative",
  skipped: "neutral",
  unchanged: "neutral",
  disabled: "neutral",
  enabled: "positive",
  active: "positive",
  // court outcome
  taxpayer: "positive",
  government: "info",
  mixed: "info",
  pending: "pending",
  remanded: "pending",
  // misc
  verified: "positive",
  updated: "info",
  routine: "neutral",
};
export function statusTone(v: string | null | undefined): StatusTone {
  return (v && STATUS_TONE[v]) || "neutral";
}

/** Change-type glyphs: mono, one character wide. */
export const CHANGE_GLYPH: Record<string, string> = {
  created: "+",
  updated: "~",
  rate_changed: "Δ",
  status_changed: "→",
  removed: "−",
};
/** Entity glyphs for the feed meta line (mono letters, no icons). */
export const ENTITY_GLYPH: Record<string, string> = {
  rate: "%",
  regulation: "R",
  court_decision: "C",
  tariff: "T",
  jurisdiction: "J",
};

export function label(map: Record<string, string>, v: string | null | undefined): string {
  if (!v) return "—";
  return map[v] ?? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function titleCaseOptions(values: string[]): Array<{ value: string; label: string }> {
  return values.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));
}
