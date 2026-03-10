"""Environment-backed settings for the Inkwise module."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "y", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def _normalize_env_text(raw: str | None, *, strip_trailing_slash: bool = False) -> str | None:
    value = (raw or "").strip().strip('"').strip("'")
    while value.endswith("\\"):
        value = value[:-1].rstrip()
    if strip_trailing_slash:
        value = value.rstrip("/")
    return value or None


_BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$")


def normalize_gcs_bucket_name(raw: str | None) -> str | None:
    value = _normalize_env_text(raw)
    if not value:
        return None
    if value.startswith("gs://"):
        value = value[5:]
    value = value.strip().strip("/")
    if not value:
        return None
    return value


def is_valid_gcs_bucket_name(value: str | None) -> bool:
    if not value:
        return False
    return bool(_BUCKET_RE.match(value))


@dataclass(frozen=True)
class InkwiseSettings:
    enabled: bool
    project_id: str | None
    location: str
    uploads_bucket: str | None
    derived_bucket: str | None
    gemini_model: str
    grounded_model: str
    treegen_model: str
    query_rewrite_model: str
    tree_search_model: str
    source_prefilter_enabled: bool
    source_prefilter_trigger_count: int
    source_prefilter_top_k: int
    source_prefilter_stage_b_enabled: bool
    query_rewrite_enabled: bool
    query_rewrite_max_history_messages: int
    query_rewrite_max_queries: int
    query_rewrite_max_query_chars: int
    query_rewrite_timeout_seconds: float
    tree_search_enabled: bool
    tree_search_min_evidence: int
    tree_search_max_sources: int
    tree_search_max_rounds: int
    tree_search_max_frontier: int
    tree_search_max_pick: int
    tree_search_timeout_seconds: float
    max_bound_sources: int
    max_upload_mb: int
    cloud_tasks_project: str | None
    cloud_tasks_location: str | None
    cloud_tasks_queue_ingest: str | None
    cloud_tasks_service_url: str | None
    tasks_token: str | None
    inline_ingest_fallback_enabled: bool

    @property
    def vertex_enabled(self) -> bool:
        return bool(self.project_id)

    @property
    def cloud_tasks_enabled(self) -> bool:
        return bool(
            self.cloud_tasks_project
            and self.cloud_tasks_location
            and self.cloud_tasks_queue_ingest
            and self.cloud_tasks_service_url
        )


def get_inkwise_settings() -> InkwiseSettings:
    default_model = os.getenv("INKWISE_GEMINI_MODEL", "gemini-3-flash-preview")
    return InkwiseSettings(
        enabled=_env_bool("INKWISE_ENABLED", True),
        project_id=_normalize_env_text(os.getenv("GOOGLE_CLOUD_PROJECT_ID") or os.getenv("GCP_PROJECT")),
        location=_normalize_env_text(os.getenv("GOOGLE_CLOUD_LOCATION", "global")) or "global",
        uploads_bucket=normalize_gcs_bucket_name(os.getenv("GCS_BUCKET_NAME")),
        derived_bucket=normalize_gcs_bucket_name(os.getenv("INKWISE_DERIVED_BUCKET") or os.getenv("GCS_BUCKET_NAME")),
        gemini_model=default_model,
        grounded_model=os.getenv("INKWISE_GROUNDED_MODEL", default_model),
        treegen_model=os.getenv("INKWISE_TREEGEN_MODEL", default_model),
        query_rewrite_model=os.getenv("INKWISE_QUERY_REWRITE_MODEL", default_model),
        tree_search_model=os.getenv("INKWISE_TREE_SEARCH_MODEL", default_model),
        source_prefilter_enabled=_env_bool("INKWISE_SOURCE_PREFILTER_ENABLED", True),
        source_prefilter_trigger_count=_env_int("INKWISE_SOURCE_PREFILTER_TRIGGER_COUNT", 20),
        source_prefilter_top_k=_env_int("INKWISE_SOURCE_PREFILTER_TOP_K", 10),
        source_prefilter_stage_b_enabled=_env_bool("INKWISE_SOURCE_PREFILTER_STAGE_B_ENABLED", True),
        query_rewrite_enabled=_env_bool("INKWISE_QUERY_REWRITE_ENABLED", False),
        query_rewrite_max_history_messages=_env_int("INKWISE_QUERY_REWRITE_MAX_HISTORY_MESSAGES", 12),
        query_rewrite_max_queries=_env_int("INKWISE_QUERY_REWRITE_MAX_QUERIES", 4),
        query_rewrite_max_query_chars=_env_int("INKWISE_QUERY_REWRITE_MAX_QUERY_CHARS", 180),
        query_rewrite_timeout_seconds=_env_float("INKWISE_QUERY_REWRITE_TIMEOUT_SECONDS", 15.0),
        tree_search_enabled=_env_bool("INKWISE_TREE_SEARCH_ENABLED", True),
        tree_search_min_evidence=_env_int("INKWISE_TREE_SEARCH_MIN_EVIDENCE", 4),
        tree_search_max_sources=_env_int("INKWISE_TREE_SEARCH_MAX_SOURCES", 3),
        tree_search_max_rounds=_env_int("INKWISE_TREE_SEARCH_MAX_ROUNDS", 3),
        tree_search_max_frontier=_env_int("INKWISE_TREE_SEARCH_MAX_FRONTIER", 40),
        tree_search_max_pick=_env_int("INKWISE_TREE_SEARCH_MAX_PICK", 8),
        tree_search_timeout_seconds=_env_float("INKWISE_TREE_SEARCH_TIMEOUT_SECONDS", 30.0),
        max_bound_sources=_env_int("INKWISE_MAX_BOUND_SOURCES", 100),
        max_upload_mb=_env_int("INKWISE_MAX_UPLOAD_MB", 100),
        cloud_tasks_project=_normalize_env_text(os.getenv("CLOUD_TASKS_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT_ID")),
        cloud_tasks_location=_normalize_env_text(os.getenv("CLOUD_TASKS_LOCATION") or os.getenv("CLOUD_RUN_REGION")),
        cloud_tasks_queue_ingest=_normalize_env_text(os.getenv("CLOUD_TASKS_QUEUE_INGEST") or os.getenv("INKWISE_TASKS_QUEUE")),
        cloud_tasks_service_url=_normalize_env_text(
            os.getenv("CLOUD_TASKS_SERVICE_URL") or os.getenv("INKWISE_TASKS_SERVICE_URL"),
            strip_trailing_slash=True,
        ),
        tasks_token=_normalize_env_text(os.getenv("TASKS_TOKEN") or os.getenv("INKWISE_TASKS_TOKEN")),
        inline_ingest_fallback_enabled=_env_bool(
            "INKWISE_INLINE_INGEST_FALLBACK_ENABLED",
            os.getenv("ENVIRONMENT", "development").strip().lower() != "production",
        ),
    )
