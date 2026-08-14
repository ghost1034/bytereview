from __future__ import annotations

import asyncio
import os
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from starlette.requests import Request

from core.database import DatabaseConfig
from main import database_pool_timeout_handler


def test_postgres_pool_settings_are_explicit(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/example")
    monkeypatch.setenv("DB_POOL_SIZE", "5")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "10")
    monkeypatch.setenv("DB_POOL_TIMEOUT_SECONDS", "5")
    monkeypatch.setenv("DB_POOL_RECYCLE_SECONDS", "1800")

    with patch("core.database.create_engine") as create_engine_mock, patch("core.database.sessionmaker"):
        DatabaseConfig()

    create_engine_mock.assert_called_once_with(
        "postgresql://user:pass@localhost/example",
        echo=False,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_timeout=5,
        pool_recycle=1800,
    )


def test_sqlite_omits_queue_pool_only_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")

    with patch("core.database.create_engine") as create_engine_mock, patch("core.database.sessionmaker"):
        DatabaseConfig()

    create_engine_mock.assert_called_once_with(
        "sqlite://",
        echo=False,
        pool_pre_ping=True,
    )


def test_database_pool_timeout_returns_retryable_503():
    request = Request({"type": "http", "method": "GET", "path": "/api/example", "headers": []})
    response = asyncio.run(database_pool_timeout_handler(request, SQLAlchemyTimeoutError("pool exhausted")))

    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    assert response.body == b'{"detail":"Database temporarily unavailable"}'
