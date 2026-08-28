/* TypeScript mirrors of backend/app/schemas/*.py and models/enums.py. Keep in sync with the API. */

// ---------------------------------------------------------------- enums
export type JurisdictionLevel = "supranational" | "country" | "state" | "province" | "territory" | "region" | "city";
export type TaxType =
  | "vat" | "gst" | "sales_use" | "corporate_income" | "personal_income" | "withholding" | "capital_gains"
  | "digital_services" | "customs_tariff" | "excise" | "payroll_social" | "property" | "transfer_pricing"
  | "pillar_two" | "other";
export type RateKind =
  | "standard" | "reduced" | "super_reduced" | "zero" | "headline" | "federal" | "state_average" | "top_marginal"
  | "dividends" | "interest" | "royalties" | "services" | "registration_threshold" | "economic_nexus_threshold"
  | "minimum" | "trade_tax" | "regional" | "stamp_duty" | "other";
export type Confidence = "verified" | "reported" | "estimated";
export type RegulationStatus = "proposed" | "consultation" | "enacted" | "effective" | "amended" | "repealed" | "guidance" | "unknown";
export type DocType = "statute" | "regulation" | "ruling" | "guidance" | "directive" | "treaty" | "news" | "consultation" | "other";
export type Significance = "landmark" | "significant" | "routine";
export type Outcome = "taxpayer" | "government" | "mixed" | "pending" | "remanded";
export type TariffMeasure =
  | "mfn" | "preferential" | "antidumping" | "countervailing" | "safeguard" | "section_232" | "section_301" | "ieepa"
  | "retaliatory" | "cbam" | "quota" | "export_control" | "other";
export type MeasureStatus = "proposed" | "in_force" | "suspended" | "expired" | "revoked" | "under_review";
export type SourceCategory = "regulation" | "court" | "tariff" | "rates" | "news";
export type AdapterType = "rss" | "html" | "json" | "fixture";
export type CrawlStatus = "running" | "success" | "failed" | "skipped" | "unchanged";
export type EntityType = "rate" | "regulation" | "court_decision" | "tariff" | "jurisdiction";
export type ChangeType = "created" | "updated" | "rate_changed" | "status_changed" | "removed";
export type UserRole = "admin" | "analyst" | "viewer";

// ---------------------------------------------------------------- common
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface Message {
  detail: string;
}

// ---------------------------------------------------------------- jurisdictions
export interface JurisdictionOut {
  id: number;
  code: string;
  name: string;
  level: JurisdictionLevel | string;
  parent_id: number | null;
  region: string | null;
  iso_alpha3: string | null;
  iso_numeric: string | null;
  fips: string | null;
  currency: string | null;
  lat: number | null;
  lon: number | null;
  tax_authority_name: string | null;
  /** English rendering of tax_authority_name; null when the name is already English. Optional until the API emits it. */
  tax_authority_name_en?: string | null;
  tax_authority_url: string | null;
  has_subnational_taxes: boolean;
  is_active: boolean;
  /** Present only when the list is requested with ?include=headline. */
  headline?: JurisdictionHeadline | null;
}
/** Headline rates bundled onto jurisdiction list rows (GET /jurisdictions?include=headline). Percentages; null = not tracked. */
export interface JurisdictionHeadline {
  vat_standard: number | null;
  sales_use_standard: number | null;
  cit_headline: number | null;
  pit_top: number | null;
  wht_dividends: number | null;
}
export interface JurisdictionDetail extends JurisdictionOut {
  summary: string | null;
  parent_code: string | null;
  children_count: number;
  rates_count: number;
  regulations_count: number;
  court_decisions_count: number;
  tariffs_count: number;
  changes_30d: number;
}
export interface JurisdictionRef {
  id: number;
  code: string;
  name: string;
  level: string;
}
export interface ChoroplethPoint {
  code: string;
  name: string;
  iso_numeric: string | null;
  fips: string | null;
  value: number | null;
  label: string | null;
  /** Provenance of the shaded value (optional; newer API versions return them). */
  as_of?: string | null;
  effective_from?: string | null;
  source_name?: string | null;
}
/** GET /map/subnational — countries whose children carry current rates, with the (tax_type, rate_kind) pairs available. */
export interface SubnationalMetric {
  tax_type: string;
  rate_kind: string;
  /** Children with a current value for this pair. */
  coverage: number;
}
export interface SubnationalCountry {
  code: string;
  name: string;
  /** Level of the children (state | province | region | territory …). */
  level: string;
  /** Active child jurisdictions (with or without rates). */
  children: number;
  metrics: SubnationalMetric[];
}
/** GET /map/metrics — every (tax_type, rate_kind) pair with a current rate for ≥ min_coverage jurisdictions at a level. */
export interface MapMetricRow {
  tax_type: string;
  rate_kind: string;
  coverage: number;
  unit: "percent" | "amount" | string;
}
export interface MapMetricsOut {
  level?: string;
  parent?: string | null;
  total: number;
  metrics: MapMetricRow[];
}
export interface ActivityPoint {
  code: string;
  name: string;
  iso_numeric: string | null;
  lat: number | null;
  lon: number | null;
  changes: number;
  court_decisions: number;
  tariffs: number;
}

// ---------------------------------------------------------------- tax data
export interface TaxRateOut {
  id: number;
  jurisdiction_id: number;
  jurisdiction: JurisdictionRef | null;
  tax_type: TaxType | string;
  rate_kind: RateKind | string;
  rate: number | null;
  threshold_amount: number | null;
  threshold_currency: string | null;
  description: string | null;
  applies_to: string | null;
  effective_from: string | null;
  effective_to: string | null;
  as_of: string | null;
  confidence: Confidence | string;
  source_name: string | null;
  source_url: string | null;
  notes: string | null;
  updated_at: string | null;
}
export interface RegulationOut {
  id: number;
  jurisdiction_id: number | null;
  jurisdiction: JurisdictionRef | null;
  tax_type: TaxType | string;
  title: string;
  summary: string | null;
  authority: string | null;
  /** BCP-47 code of the original text (`ar`, `pl`, `zh-Hant`); null = not detected. Optional until the API emits it. */
  lang?: string | null;
  /** Machine translations; null when the original is already English. */
  title_en?: string | null;
  summary_en?: string | null;
  /** Not emitted by the API (authority_en lives on Source); pages fill it client-side from the linked source. */
  authority_en?: string | null;
  doc_type: DocType | string;
  status: RegulationStatus | string;
  reference: string | null;
  published_date: string | null;
  effective_date: string | null;
  source_url: string;
  source_id: number | null;
  tags: string[] | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}
export interface RegulationDetail extends RegulationOut {
  body_excerpt: string | null;
}
export interface CourtDecisionOut {
  id: number;
  jurisdiction_id: number | null;
  jurisdiction: JurisdictionRef | null;
  court: string;
  case_name: string;
  citation: string | null;
  docket: string | null;
  decision_date: string | null;
  tax_types: string[] | null;
  summary: string | null;
  holding: string | null;
  /** BCP-47 code of the original text; null = not detected. Optional until the API emits it. */
  lang?: string | null;
  /** Machine translations; null when the original is already English. */
  case_name_en?: string | null;
  summary_en?: string | null;
  holding_en?: string | null;
  significance: Significance | string;
  outcome: Outcome | string;
  source_url: string;
  tags: string[] | null;
  first_seen_at: string | null;
}
export interface TariffOut {
  id: number;
  importing_jurisdiction_id: number;
  importing_jurisdiction: JurisdictionRef | null;
  partner_jurisdiction_id: number | null;
  partner_jurisdiction: JurisdictionRef | null;
  partner_scope: string | null;
  hs_code: string | null;
  product_description: string;
  measure_type: TariffMeasure | string;
  rate: number | null;
  rate_text: string | null;
  legal_basis: string | null;
  status: MeasureStatus | string;
  effective_from: string | null;
  effective_to: string | null;
  source_url: string | null;
  notes: string | null;
  /** BCP-47 code of the original text; null = not detected. Optional until the API emits it. */
  lang?: string | null;
  /** Machine translations; null when the original is already English. */
  product_description_en?: string | null;
  notes_en?: string | null;
  updated_at: string | null;
}
export interface ChangeEventOut {
  id: number;
  entity_type: EntityType | string;
  entity_id: number;
  jurisdiction_id: number | null;
  jurisdiction: JurisdictionRef | null;
  tax_type: string | null;
  change_type: ChangeType | string;
  title: string;
  /** English rendering of the title; null when already English. Optional until the API emits it. */
  title_en?: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  source_id: number | null;
  detected_at: string;
}
export interface SourceOut {
  id: number;
  slug: string;
  name: string;
  url: string;
  jurisdiction_id: number | null;
  jurisdiction: JurisdictionRef | null;
  tax_types: string[] | null;
  category: SourceCategory | string;
  adapter: AdapterType | string;
  schedule_cron: string;
  enabled: boolean;
  authority: string | null;
  /** English rendering of the authority name; null when already English. Optional until the API emits it. */
  authority_en?: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_status: CrawlStatus | string | null;
  last_error: string | null;
  items_total: number;
  consecutive_failures: number;
}
export interface CrawlRunOut {
  id: number;
  source_id: number;
  started_at: string;
  finished_at: string | null;
  status: CrawlStatus | string;
  http_status: number | null;
  items_found: number;
  items_new: number;
  items_changed: number;
  error: string | null;
  triggered_by: string;
}
export interface StatsOverview {
  jurisdictions: number;
  countries: number;
  subnational: number;
  rates: number;
  regulations: number;
  court_decisions: number;
  tariffs: number;
  sources: number;
  sources_enabled: number;
  changes_7d: number;
  changes_30d: number;
  last_crawl_at: string | null;
  by_tax_type: Record<string, number>;
  by_region: Record<string, number>;
}
export interface JurisdictionSummary {
  jurisdiction: JurisdictionDetail;
  rates_by_type: Record<string, TaxRateOut[]>;
  recent_regulations: RegulationOut[];
  recent_court_decisions: CourtDecisionOut[];
  recent_tariffs: TariffOut[];
  recent_changes: ChangeEventOut[];
}

// ---------------------------------------------------------------- users / account
export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  organization: string | null;
  role: UserRole | string;
  is_active: boolean;
  created_at: string;
}
export interface ApiKeyOut {
  id: number;
  name: string;
  prefix: string;
  scopes: string[] | null;
  rate_limit_per_minute: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  request_count: number;
}
export interface ApiKeyCreated extends ApiKeyOut {
  key: string;
}
export interface WatchItemIn {
  jurisdiction_code?: string | null;
  tax_type?: string | null;
  include_children?: boolean;
}
export interface WatchItemOut {
  id: number;
  jurisdiction_id: number | null;
  jurisdiction_code: string | null;
  jurisdiction_name: string | null;
  tax_type: string | null;
  include_children: boolean;
  created_at: string;
}
export interface NotificationOut {
  id: number;
  change_event: ChangeEventOut;
  created_at: string;
  read_at: string | null;
}
export interface Quickstart {
  auth: string;
  examples: string[];
  rate_limit_headers: string[];
  docs: string;
}
export interface EnumsOut {
  tax_types: string[];
  rate_kinds: string[];
  jurisdiction_levels: string[];
  regulation_statuses: string[];
  doc_types: string[];
  tariff_measures: string[];
  measure_statuses: string[];
  significance: string[];
  outcomes: string[];
  change_types: string[];
  entity_types: string[];
  confidence: string[];
}

// ---------------------------------------------------------------- aggregates
export interface ChangeHistogram {
  days: Array<{ date: string; count: number }>;
  total: number;
  since: string;
}

// ---------------------------------------------------------------- admin maintenance (mirrors admin.py schemas)
export interface RateCreate {
  jurisdiction_code: string;
  tax_type: string;
  rate_kind: string;
  rate?: number | null;
  threshold_amount?: number | null;
  threshold_currency?: string | null;
  description?: string | null;
  applies_to?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  as_of?: string | null;
  confidence?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  notes?: string | null;
  /** Close the currently open row for the same (jurisdiction, tax_type, rate_kind) at effective_from − 1 day. */
  supersede?: boolean;
}
export type RatePatch = Partial<Omit<RateCreate, "jurisdiction_code" | "tax_type" | "rate_kind" | "supersede">> & { reason?: string | null };

export interface RegulationCreate {
  jurisdiction_code?: string | null;
  tax_type: string;
  title: string;
  summary?: string | null;
  body_excerpt?: string | null;
  authority?: string | null;
  doc_type?: string | null;
  status?: string | null;
  reference?: string | null;
  published_date?: string | null;
  effective_date?: string | null;
  source_url: string;
  tags?: string[] | null;
}
export type RegulationPatch = Partial<Omit<RegulationCreate, "source_url">> & { reason?: string | null };

export interface CourtDecisionCreate {
  jurisdiction_code?: string | null;
  court: string;
  case_name: string;
  citation?: string | null;
  docket?: string | null;
  decision_date?: string | null;
  tax_types?: string[] | null;
  summary?: string | null;
  holding?: string | null;
  significance?: string | null;
  outcome?: string | null;
  source_url: string;
  tags?: string[] | null;
}
export type CourtDecisionPatch = Partial<Omit<CourtDecisionCreate, "source_url">> & { reason?: string | null };

export interface TariffCreate {
  importing_jurisdiction_code: string;
  partner_jurisdiction_code?: string | null;
  partner_scope?: string | null;
  hs_code?: string | null;
  product_description: string;
  measure_type: string;
  rate?: number | null;
  rate_text?: string | null;
  legal_basis?: string | null;
  status?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  source_url?: string | null;
  notes?: string | null;
}
export type TariffPatch = Partial<Omit<TariffCreate, "importing_jurisdiction_code">> & { reason?: string | null };

export interface JurisdictionPatch {
  name?: string | null;
  region?: string | null;
  currency?: string | null;
  lat?: number | null;
  lon?: number | null;
  tax_authority_name?: string | null;
  tax_authority_url?: string | null;
  summary?: string | null;
  has_subnational_taxes?: boolean | null;
  is_active?: boolean | null;
  reason?: string | null;
}

// ---------------------------------------------------------------- delivery channels (/account/delivery)
export type DeliveryKind = "webhook" | "email";
export type DeliveryDigest = "instant" | "daily";
export interface DeliveryFilters {
  tax_types?: string[] | null;
  jurisdiction_codes?: string[] | null;
  change_types?: string[] | null;
}
export interface DeliveryChannelIn {
  kind: DeliveryKind;
  target: string;
  digest?: DeliveryDigest;
  enabled?: boolean;
  filters?: DeliveryFilters | null;
}
export interface DeliveryChannelPatch {
  target?: string | null;
  digest?: DeliveryDigest | null;
  enabled?: boolean | null;
  filters?: DeliveryFilters | null;
  clear_filters?: boolean;
}
export interface DeliveryChannelOut {
  id: number;
  kind: DeliveryKind | string;
  target: string;
  enabled: boolean;
  digest: DeliveryDigest | string;
  filters: DeliveryFilters | null;
  has_secret: boolean;
  created_at: string;
  last_delivered_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  disabled_reason: string | null;
}
export interface DeliveryChannelCreated extends DeliveryChannelOut {
  /** Webhook signing secret ("whsec_…"); shown once. */
  secret: string | null;
}
export interface DeliveryTestResult {
  ok: boolean;
  event_id: string;
  status_code: number | null;
  error: string | null;
  duration_ms: number;
}
export interface DeliveryAttemptOut {
  id: number;
  channel_id: number;
  notification_id: number;
  attempt_no: number;
  status: "pending" | "sent" | "failed" | "dead" | "skipped" | string;
  http_status: number | null;
  error: string | null;
  created_at: string;
  next_attempt_at: string | null;
}
