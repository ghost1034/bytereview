"""Runtime environment helpers.

Local storage and task backends are safe defaults for development. Security
bypasses additionally require an explicitly selected local environment.
"""

from __future__ import annotations

import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_ENVIRONMENTS = {"local", "dev", "development", "test"}


def environment() -> str:
    return (os.getenv("ENVIRONMENT") or "local").strip().lower()


def is_production() -> bool:
    return environment() == "production"


def is_local() -> bool:
    return environment() in LOCAL_ENVIRONMENTS


def is_explicitly_local() -> bool:
    configured = (os.getenv("ENVIRONMENT") or "").strip().lower()
    return bool(configured) and configured in LOCAL_ENVIRONMENTS


def storage_backend() -> str:
    configured = (os.getenv("STORAGE_BACKEND") or "").strip().lower()
    if configured:
        return configured
    return "local" if is_local() else "gcs"


def task_backend() -> str:
    configured = (os.getenv("TASK_BACKEND") or os.getenv("TASKS_MODE") or "").strip().lower()
    if configured:
        return configured
    return "local" if is_local() else "cloud"


def local_storage_root() -> Path:
    configured = (os.getenv("LOCAL_STORAGE_PATH") or "").strip()
    return Path(configured).expanduser().resolve() if configured else REPO_ROOT / ".local" / "storage"


def local_api_base_url() -> str:
    return (os.getenv("LOCAL_API_BASE_URL") or "http://127.0.0.1:8000").rstrip("/")


def frontend_base_url() -> str:
    configured = (os.getenv("APP_BASE_URL") or os.getenv("CPAA_DASHBOARD_PUBLIC_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    return "http://localhost:3000" if is_local() else "https://cpaautomation.ai"


def public_api_base_url() -> str:
    configured = (os.getenv("PUBLIC_API_BASE_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    return local_api_base_url() if is_local() else "https://api.cpaautomation.ai"


def local_auth_enabled() -> bool:
    environment_is_explicitly_local = (os.getenv("ENVIRONMENT") or "").strip().lower() == "local"
    bypass_is_explicitly_enabled = (os.getenv("LOCAL_AUTH_BYPASS") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    return environment_is_explicitly_local and bypass_is_explicitly_enabled


def require_cloud_value(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required outside local development")
    return value
