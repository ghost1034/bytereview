"""Configuration from environment / .env. No secrets hard-coded; production requires a real SECRET_KEY."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FirmCRM"
    app_env: str = Field(default="development", description="development | test | production")
    log_level: str = "INFO"
    log_format: str | None = None  # json | text; defaults to json in production, text otherwise
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.0
    max_request_bytes: int = 10 * 1024 * 1024
    hsts_seconds: int = 31536000  # sent only in production (assumes TLS termination in front)
    database_url: str = "sqlite:///./crm.db"
    secret_key: str = "dev-only-change-me-not-for-production-use-0000"
    bcrypt_rounds: int = Field(default=12, ge=4, le=16)
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    # Login protection
    login_max_failures: int = 5
    lockout_minutes: int = 15
    login_rate_limit_per_minute: int = 10  # per client IP
    redis_url: str | None = None  # when set, rate limits are shared across workers/replicas
    admin_bypasses_walls: bool = True  # set false for a strict ethical-wall regime (admins see only walls they are in)
    password_min_length: int = 12
    trust_proxy_headers: bool = False  # set true behind nginx/ALB to read X-Forwarded-For
    # NoDecode: accept a plain comma-separated string from the environment (pydantic-settings would otherwise expect JSON).
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5180", "http://localhost:8080"]
    default_currency: str = "USD"
    # Business rules
    stale_opportunity_days: int = 21  # no activity for this long => flagged stale
    conflict_match_threshold: float = 0.82  # fuzzy ratio for name matching

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [p.strip() for p in v.split(",") if p.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def effective_log_format(self) -> str:
        return self.log_format or ("json" if self.is_production else "text")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def validate_for_runtime(self) -> None:
        if len(self.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be at least 32 characters")
        if self.is_production:
            if self.secret_key.startswith("dev-only-change-me"):
                raise RuntimeError("SECRET_KEY must be changed from the development default in production")
            if any(o.startswith("http://localhost") for o in self.cors_origins):
                raise RuntimeError("CORS_ORIGINS must not include localhost in production")
            if self.is_sqlite:
                raise RuntimeError("SQLite is not supported in production; set DATABASE_URL to Postgres")


@lru_cache
def get_settings() -> Settings:
    return Settings()
