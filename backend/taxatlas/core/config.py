"""Namespaced TaxAtlas settings; shared platform configuration is reused."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TAXATLAS_", extra="ignore")

    app_env: str = "development"
    app_name: str = "TaxAtlas"
    public_url: str = "http://localhost:3000"
    crawler_enabled: bool = True
    crawler_network: bool = True
    crawler_user_agent: str = "CPAAutomation TaxAtlas/1.0"
    crawler_timeout_seconds: int = 20
    browser_enabled: bool = False
    browser_timeout_seconds: int = 45
    browser_user_agent: str = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    )
    rate_limit_default: int = 120
    rate_limit_anon: int = 20
    redis_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "TaxAtlas <no-reply@localhost>"
    smtp_starttls: bool = True
    webhook_timeout_seconds: int = 10
    notify_dispatch_interval_seconds: int = 60
    notify_max_attempts: int = 5
    translate_provider: str = "none"
    translate_target: str = "en"
    translate_max_chars: int = 2000
    translate_daily_char_budget: int = 2_000_000
    translate_gcp_project: str = ""
    translate_gcp_location: str = "global"

    @property
    def database_url(self) -> str:
        return os.getenv("DATABASE_URL", "")

    @property
    def translate_project(self) -> str:
        return self.translate_gcp_project or os.getenv("GOOGLE_CLOUD_PROJECT", "")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return os.getenv("ENVIRONMENT", self.app_env).lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and "TAXATLAS_PUBLIC_URL" not in os.environ:
        settings.public_url = frontend_url
    return settings
