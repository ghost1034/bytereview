"""Canonical frontend URL configuration for E-Signature links."""

from __future__ import annotations

import os

from core.runtime import frontend_base_url


PRODUCTION_APP_BASE_URL = "https://cpaautomation.ai"
LOCAL_APP_BASE_URL = "http://localhost:3000"
LOCAL_ENVIRONMENTS = {"dev", "development", "local", "test"}


def app_base_url() -> str:
    """Return the frontend origin used in recipient-facing E-Signature links.

    Local is the safe default so an incompletely configured developer process
    cannot emit production links. Production requires ``ENVIRONMENT=production``;
    ``ESIGN_APP_BASE_URL`` remains the explicit per-deployment override.
    """
    explicit = os.getenv("ESIGN_APP_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")

    return frontend_base_url()
