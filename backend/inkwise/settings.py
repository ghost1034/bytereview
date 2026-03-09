"""Environment-backed settings for the Inkwise module."""

from __future__ import annotations

import os
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
    query_rewrite_enabled: bool
    tree_search_enabled: bool
    max_bound_sources: int
    max_upload_mb: int
    cloud_tasks_project: str | None
    cloud_tasks_location: str | None
    cloud_tasks_queue_ingest: str | None
    cloud_tasks_service_url: str | None
    tasks_token: str | None

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
    default_model = os.getenv("INKWISE_GEMINI_MODEL", "gemini-2.5-pro")
    return InkwiseSettings(
        enabled=_env_bool("INKWISE_ENABLED", True),
        project_id=os.getenv("GOOGLE_CLOUD_PROJECT_ID") or os.getenv("GCP_PROJECT") or None,
        location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
        uploads_bucket=os.getenv("GCS_BUCKET_NAME") or None,
        derived_bucket=os.getenv("INKWISE_DERIVED_BUCKET") or os.getenv("GCS_BUCKET_NAME") or None,
        gemini_model=default_model,
        grounded_model=os.getenv("INKWISE_GROUNDED_MODEL", default_model),
        treegen_model=os.getenv("INKWISE_TREEGEN_MODEL", default_model),
        query_rewrite_model=os.getenv("INKWISE_QUERY_REWRITE_MODEL", default_model),
        tree_search_model=os.getenv("INKWISE_TREE_SEARCH_MODEL", default_model),
        source_prefilter_enabled=_env_bool("INKWISE_SOURCE_PREFILTER_ENABLED", True),
        query_rewrite_enabled=_env_bool("INKWISE_QUERY_REWRITE_ENABLED", False),
        tree_search_enabled=_env_bool("INKWISE_TREE_SEARCH_ENABLED", True),
        max_bound_sources=_env_int("INKWISE_MAX_BOUND_SOURCES", 100),
        max_upload_mb=_env_int("INKWISE_MAX_UPLOAD_MB", 100),
        cloud_tasks_project=os.getenv("CLOUD_TASKS_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT_ID") or None,
        cloud_tasks_location=os.getenv("CLOUD_TASKS_LOCATION") or os.getenv("CLOUD_RUN_REGION") or None,
        cloud_tasks_queue_ingest=os.getenv("CLOUD_TASKS_QUEUE_INGEST") or os.getenv("INKWISE_TASKS_QUEUE") or None,
        cloud_tasks_service_url=os.getenv("CLOUD_TASKS_SERVICE_URL") or os.getenv("INKWISE_TASKS_SERVICE_URL") or None,
        tasks_token=os.getenv("TASKS_TOKEN") or os.getenv("INKWISE_TASKS_TOKEN") or None,
    )
