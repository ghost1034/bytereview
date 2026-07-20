"""Canonical frontend URL configuration for E-Signature links."""

from __future__ import annotations

import os


PRODUCTION_APP_BASE_URL = "https://cpaautomation.ai"
LOCAL_APP_BASE_URL = "http://localhost:3000"
LOCAL_ENVIRONMENTS = {"dev", "development", "local", "test"}


def app_base_url() -> str:
    """Return the frontend origin used in recipient-facing E-Signature links.

    Production is the safe default because these URLs are embedded in outbound
    email. Local development remains available through ``ENVIRONMENT=local``
    or an explicit ``ESIGN_APP_BASE_URL`` override.
    """
    explicit = os.getenv("ESIGN_APP_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")

    environment = os.getenv("ENVIRONMENT", "").strip().lower()
    if environment in LOCAL_ENVIRONMENTS:
        return LOCAL_APP_BASE_URL
    return PRODUCTION_APP_BASE_URL
